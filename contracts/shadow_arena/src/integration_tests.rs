#[cfg(test)]
mod tests {
    use cosmwasm_std::{coins, Uint128};
    use cosmwasm_std::{Empty, IbcMsg, IbcQuery, MemoryStorage};
    use cw_multi_test::{
        App, AppBuilder, BankKeeper, ContractWrapper, Executor, FailingModule, MockApiBech32,
        StargateFailing, WasmKeeper,
    };

    use crate::{
        contract::{execute, instantiate, query},
        msg::{ExecuteMsg, InstantiateMsg},
    };

    const DENOM: &str = "inj";
    const STAKE: u128 = 1_000_000;

    type TestApp = App<
        BankKeeper,
        MockApiBech32,
        MemoryStorage,
        FailingModule<Empty, Empty, Empty>,
        WasmKeeper<Empty, Empty>,
        FailingModule<Empty, Empty, Empty>,
        FailingModule<Empty, Empty, Empty>,
        FailingModule<IbcMsg, IbcQuery, Empty>,
        FailingModule<Empty, Empty, Empty>,
        StargateFailing,
    >;

    fn setup() -> (TestApp, cosmwasm_std::Addr) {
        let api = MockApiBech32::new("cosmwasm");
        let player_a = api.addr_make("player_a");
        let player_b = api.addr_make("player_b");
        let stranger = api.addr_make("stranger");
        let owner = api.addr_make("owner");
        let server = api.addr_make("server");
        let resolver = api.addr_make("resolver");

        let mut app: TestApp = AppBuilder::new().with_api(api).build(|router, _, storage| {
            router
                .bank
                .init_balance(storage, &player_a, coins(10 * STAKE, DENOM))
                .unwrap();
            router
                .bank
                .init_balance(storage, &player_b, coins(10 * STAKE, DENOM))
                .unwrap();
            router
                .bank
                .init_balance(storage, &stranger, coins(10 * STAKE, DENOM))
                .unwrap();
        });

        let code = ContractWrapper::new(execute, instantiate, query);
        let code_id = app.store_code(Box::new(code));

        let contract = app
            .instantiate_contract(
                code_id,
                owner,
                &InstantiateMsg {
                    server_authority: server.to_string(),
                    dispute_resolver: resolver.to_string(),
                    fee_bps: 400,
                    dispute_window_secs: 600,
                    resolve_deadline_secs: 259200,
                },
                &[],
                "shadow-arena-escrow",
                None,
            )
            .unwrap();

        (app, contract)
    }

    fn reach_active(app: &mut TestApp, contract: &cosmwasm_std::Addr, match_id: &str) {
        let player_a = app.api().addr_make("player_a");
        let player_b = app.api().addr_make("player_b");

        app.execute_contract(
            player_a.clone(),
            contract.clone(),
            &ExecuteMsg::CreateMatch {
                match_id: match_id.to_string(),
                player_a: player_a.to_string(),
                player_b: player_b.to_string(),
                stake: STAKE.to_string(),
                denom: DENOM.to_string(),
            },
            &[],
        )
        .unwrap();

        app.execute_contract(
            player_a.clone(),
            contract.clone(),
            &ExecuteMsg::FundMatch {
                match_id: match_id.to_string(),
            },
            &coins(STAKE, DENOM),
        )
        .unwrap();

        app.execute_contract(
            player_b.clone(),
            contract.clone(),
            &ExecuteMsg::FundMatch {
                match_id: match_id.to_string(),
            },
            &coins(STAKE, DENOM),
        )
        .unwrap();
    }

    fn reach_finished(
        app: &mut TestApp,
        contract: &cosmwasm_std::Addr,
        match_id: &str,
        winner_key: &str,
        multiplier: u8,
    ) {
        let server = app.api().addr_make("server");
        let player_a = app.api().addr_make("player_a");
        let player_b = app.api().addr_make("player_b");
        let winner = app.api().addr_make(winner_key);

        app.execute_contract(
            server,
            contract.clone(),
            &ExecuteMsg::SubmitResult {
                match_id: match_id.to_string(),
                winner: winner.to_string(),
                multiplier,
                game_hash: "ab".repeat(32),
                evidence_hash: None,
            },
            &[],
        )
        .unwrap();

        app.execute_contract(
            player_a,
            contract.clone(),
            &ExecuteMsg::ConfirmResult {
                match_id: match_id.to_string(),
            },
            &[],
        )
        .unwrap();

        app.execute_contract(
            player_b,
            contract.clone(),
            &ExecuteMsg::ConfirmResult {
                match_id: match_id.to_string(),
            },
            &[],
        )
        .unwrap();
    }

    #[test]
    fn test_normal_flow() {
        let (mut app, contract) = setup();
        let player_a = app.api().addr_make("player_a");
        let player_b = app.api().addr_make("player_b");

        reach_active(&mut app, &contract, "m1");
        reach_finished(&mut app, &contract, "m1", "player_a", 1);
        app.update_block(|b| b.time = b.time.plus_seconds(601));

        app.execute_contract(
            player_a.clone(),
            contract.clone(),
            &ExecuteMsg::Claim {
                match_id: "m1".to_string(),
            },
            &[],
        )
        .unwrap();

        let bal_a = app.wrap().query_balance(player_a.as_str(), DENOM).unwrap();
        assert_eq!(bal_a.amount, Uint128::new(10 * STAKE - STAKE + 1_920_000));

        let bal_b = app.wrap().query_balance(player_b.as_str(), DENOM).unwrap();
        assert_eq!(bal_b.amount, Uint128::new(10 * STAKE - STAKE));
    }

    #[test]
    fn test_gammon_payout_capped() {
        let (mut app, contract) = setup();
        let player_a = app.api().addr_make("player_a");

        reach_active(&mut app, &contract, "m2");
        reach_finished(&mut app, &contract, "m2", "player_a", 2);
        app.update_block(|b| b.time = b.time.plus_seconds(601));

        app.execute_contract(
            player_a.clone(),
            contract.clone(),
            &ExecuteMsg::Claim {
                match_id: "m2".to_string(),
            },
            &[],
        )
        .unwrap();

        let bal_a = app.wrap().query_balance(player_a.as_str(), DENOM).unwrap();
        assert_eq!(bal_a.amount, Uint128::new(10 * STAKE - STAKE + 1_920_000));
    }

    #[test]
    fn test_dispute_and_resolve() {
        let (mut app, contract) = setup();
        let player_b = app.api().addr_make("player_b");
        let resolver = app.api().addr_make("resolver");

        reach_active(&mut app, &contract, "m3");
        reach_finished(&mut app, &contract, "m3", "player_a", 1);

        app.execute_contract(
            player_b.clone(),
            contract.clone(),
            &ExecuteMsg::RaiseDispute {
                match_id: "m3".to_string(),
                evidence_hash: "cd".repeat(32),
            },
            &[],
        )
        .unwrap();

        app.execute_contract(
            resolver,
            contract.clone(),
            &ExecuteMsg::ResolveDispute {
                match_id: "m3".to_string(),
                final_winner: player_b.to_string(),
                final_multiplier: 1,
            },
            &[],
        )
        .unwrap();

        let bal_b = app.wrap().query_balance(player_b.as_str(), DENOM).unwrap();
        assert_eq!(bal_b.amount, Uint128::new(10 * STAKE - STAKE + 1_920_000));
    }

    #[test]
    fn test_server_cannot_settle_alone() {
        let (mut app, contract) = setup();
        let server = app.api().addr_make("server");
        let player_a = app.api().addr_make("player_a");

        reach_active(&mut app, &contract, "m4");

        app.execute_contract(
            server,
            contract.clone(),
            &ExecuteMsg::SubmitResult {
                match_id: "m4".to_string(),
                winner: player_a.to_string(),
                multiplier: 1,
                game_hash: "ef".repeat(32),
                evidence_hash: None,
            },
            &[],
        )
        .unwrap();

        let err = app
            .execute_contract(
                player_a,
                contract.clone(),
                &ExecuteMsg::Claim {
                    match_id: "m4".to_string(),
                },
                &[],
            )
            .unwrap_err();

        assert!(format!("{:?}", err).contains("Invalid state transition"));
    }

    #[test]
    fn test_duplicate_match_id() {
        let (mut app, contract) = setup();
        let player_a = app.api().addr_make("player_a");
        let player_b = app.api().addr_make("player_b");

        let msg = ExecuteMsg::CreateMatch {
            match_id: "m5".to_string(),
            player_a: player_a.to_string(),
            player_b: player_b.to_string(),
            stake: STAKE.to_string(),
            denom: DENOM.to_string(),
        };

        app.execute_contract(player_a.clone(), contract.clone(), &msg, &[])
            .unwrap();

        let err = app
            .execute_contract(player_a, contract.clone(), &msg, &[])
            .unwrap_err();

        assert!(format!("{:?}", err).contains("Match already exists"));
    }

    #[test]
    fn test_emergency_cancel() {
        let (mut app, contract) = setup();
        let player_a = app.api().addr_make("player_a");
        let player_b = app.api().addr_make("player_b");

        reach_active(&mut app, &contract, "m6");
        app.update_block(|b| b.time = b.time.plus_seconds(259201));

        app.execute_contract(
            player_a.clone(),
            contract.clone(),
            &ExecuteMsg::EmergencyCancel {
                match_id: "m6".to_string(),
            },
            &[],
        )
        .unwrap();

        let bal_a = app.wrap().query_balance(player_a.as_str(), DENOM).unwrap();
        let bal_b = app.wrap().query_balance(player_b.as_str(), DENOM).unwrap();
        assert_eq!(bal_a.amount, Uint128::new(10 * STAKE));
        assert_eq!(bal_b.amount, Uint128::new(10 * STAKE));
    }

    #[test]
    fn test_non_player_cannot_fund() {
        let (mut app, contract) = setup();
        let player_a = app.api().addr_make("player_a");
        let player_b = app.api().addr_make("player_b");
        let stranger = app.api().addr_make("stranger");

        app.execute_contract(
            player_a.clone(),
            contract.clone(),
            &ExecuteMsg::CreateMatch {
                match_id: "m7".to_string(),
                player_a: player_a.to_string(),
                player_b: player_b.to_string(),
                stake: STAKE.to_string(),
                denom: DENOM.to_string(),
            },
            &[],
        )
        .unwrap();

        let err = app
            .execute_contract(
                stranger,
                contract.clone(),
                &ExecuteMsg::FundMatch {
                    match_id: "m7".to_string(),
                },
                &coins(STAKE, DENOM),
            )
            .unwrap_err();

        assert!(format!("{:?}", err).contains("Not a player"));
    }

    #[test]
    fn test_dispute_after_window_fails() {
        let (mut app, contract) = setup();
        let player_b = app.api().addr_make("player_b");

        reach_active(&mut app, &contract, "m8");
        reach_finished(&mut app, &contract, "m8", "player_a", 1);
        app.update_block(|b| b.time = b.time.plus_seconds(601));

        let err = app
            .execute_contract(
                player_b,
                contract.clone(),
                &ExecuteMsg::RaiseDispute {
                    match_id: "m8".to_string(),
                    evidence_hash: "ff".repeat(32),
                },
                &[],
            )
            .unwrap_err();

        assert!(format!("{:?}", err).contains("Dispute window has expired"));
    }
}
