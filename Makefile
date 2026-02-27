.PHONY: test-yield-bot yield-bot-devnet test-local-validator test-sdk build-devnet upgrade-earn-devnet upgrade-ext-earn-devnet deploy-yield-bot deploy-dashboard-devnet deploy-dashboard-mainnet

#
# Test commands
#
test-yield-bot:
	@cd sdk && pnpm build
	cd tests && pnpm jest --preset ts-jest tests/unit/yieldbot.test.ts; exit $$?

test-sdk:
	@cd sdk && pnpm build
	cd tests && pnpm jest --preset ts-jest tests/unit/sdk.test.ts; exit $$?

test-merkle:
	cd tests && pnpm jest --preset ts-jest tests/unit/merkle.test.ts; exit $$?

build-test-swap-program:
	@cd ../solana-extensions && anchor build -p ext_swap
	@cp -f ../solana-extensions/target/deploy/ext_swap.so tests/programs/ext_swap.so
	@cp -f ../solana-extensions/target/idl/ext_swap.json tests/programs/ext_swap.json
	@cp -f ../solana-extensions/target/types/ext_swap.ts tests/programs/ext_swap.ts

build-test-earn-programs:
	anchor build -p earn -- --features testing --no-default-features
	@mv target/deploy/earn.so target/deploy/earn_new_test.so
	@mv target/idl/earn.json target/idl/earn_new_test.json
	@mv target/types/earn.ts target/types/earn_new_test.ts
	anchor build -p earn -- --features migrate,testing --no-default-features
	@mv target/deploy/earn.so target/deploy/earn_migrate_test.so
	@mv target/idl/earn.json target/idl/earn_migrate_test.json
	@mv target/types/earn.ts target/types/earn_migrate_test.ts

test-earn:
	cd tests && pnpm jest --preset ts-jest tests/unit/earn.test.ts; exit $$?

#
# Devnet commands
#
yield-bot-devnet:
	@RPC_URL=$(shell op read "op://Solana Dev/Helius/dev rpc") \
		DEVNET=true \
		MONGO_CONNECTION_STRING=$(shell op read "op://Solana Dev/Mongo Read Access/devnet-connection-string") \
		ETH_RPC_URL=$(shell op read "op://Solana Dev/Alchemy/sepolia") \
		KEYPAIR=$(shell op read "op://Solana Dev/Solana Program Keys/devnet-authority") \
		pnpm --silent ts-node services/yield-bot/main.ts distribute --dryRun

yield-bot-mainnet:
	@RPC_URL=$(shell op read "op://Solana Dev/Helius/prod rpc") \
		ETH_RPC_URL=$(shell op read "op://Solana Dev/Alchemy/mainnet") \
		TURNKEY_PUBKEY=5FFDpVvjVPEVGb9SgN9V5HNC6gkrPdVqdX6CxXBVwZV \
		TURNKEY_API_PUBLIC_KEY=$(shell op read "op://Solana Secure/Turnkey API keys/public-key-prod") \
		TURNKEY_API_PRIVATE_KEY=$(shell op read "op://Solana Secure/Turnkey API keys/private-key-prod") \
		MONGO_CONNECTION_STRING=$(shell op read "op://Solana Dev/Mongo Read Access/connection string") \
		pnpm --silent ts-node services/yield-bot/main.ts distribute --dryRun

#
# Program upgrade commands
#
EARN_PROGRAM_ID := MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c
SQUADS_VAULT := 9QpF8a9TDM9DMiQ556bjEAyAx3WRunzW9HfiDcAPNyJW
DEVNET_KEYPAIR := devnet-keypair.json
COMPUTE_UNIT_PRICE := 300000
MAX_SIGN_ATTEMPTS := 5

define build-verified
	@echo "Building verified $(1) program for $(2)...\n"
	anchor build -p $(1) --verifiable -- --features $(2) --no-default-features
endef

define upgrade_program
	@solana-keygen new --no-bip39-passphrase --force -s --outfile=temp-buffer.json
	@echo "\nWriting buffer for $(1) program..."
	@solana program write-buffer \
		--with-compute-unit-price $(COMPUTE_UNIT_PRICE) \
		--keypair $(DEVNET_KEYPAIR) \
		--max-sign-attempts $(MAX_SIGN_ATTEMPTS) \
		--buffer temp-buffer.json \
		target/verifiable/$(1).so
	@echo "Upgrading program with buffer $$(solana address --keypair temp-buffer.json)"
	@solana program upgrade \
		--keypair $(DEVNET_KEYPAIR) \
		$$(solana address --keypair temp-buffer.json) \
		$(2)
	@rm temp-buffer.json
endef

define propose_upgrade_program
	@solana-keygen new --no-bip39-passphrase --force -s --outfile=temp-buffer.json
	@echo "\nWriting buffer for $(1) program..."
	@solana program write-buffer \
		--with-compute-unit-price $(COMPUTE_UNIT_PRICE) \
		--keypair $(DEVNET_KEYPAIR) \
		--max-sign-attempts $(MAX_SIGN_ATTEMPTS) \
		--buffer temp-buffer.json \
		target/verifiable/$(1).so
	@echo "Transfering buffer $$(solana address --keypair temp-buffer.json) authority to Squads"
	@solana program set-buffer-authority $$(solana address --keypair temp-buffer.json) \
		--new-buffer-authority $(SQUADS_VAULT) \
		--keypair $(DEVNET_KEYPAIR)
	@cat temp-buffer.json
	@rm temp-buffer.json
endef

upgrade-earn-devnet:
	$(call build-verified,earn,devnet)
	$(call upgrade_program,earn,$(EARN_PROGRAM_ID))

upgrade-earn-mainnet:
	$(call build-verified,earn,mainnet)
	$(call propose_upgrade_program,earn,$(EARN_PROGRAM_ID))

#
# Railway infra
#
define deploy-yield-bot
	railway environment $(1)
	docker build --build-arg now="$$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --platform linux/amd64 -t ghcr.io/m0-foundation/solana-m:yield-bot -f services/yield-bot/Dockerfile .
	docker push ghcr.io/m0-foundation/solana-m:yield-bot
	railway redeploy --service "yield bot" --yes
endef

define deploy-index-bot
	railway environment $(1)
	docker build --build-arg now="$$(date -u +"%Y-%m-%dT%H:%M:%SZ")" --platform linux/amd64 -t ghcr.io/m0-foundation/solana-m:index-bot -f services/index-bot/Dockerfile .
	docker push ghcr.io/m0-foundation/solana-m:index-bot
	railway redeploy --service "index bot" --yes
endef

deploy-yield-bot-devnet:
	$(call deploy-yield-bot,development)

deploy-yield-bot-mainnet:
	$(call deploy-yield-bot,production)

deploy-index-bot-devnet:
	$(call deploy-index-bot,development)

deploy-index-bot-mainnet:
	$(call deploy-index-bot,production)

#
# Substreams
#
DEVNET_STARTING_BLOCK := 364230817
MAINNET_STARTING_BLOCK := 339967540

define build-substream
	@cd substreams/graph && \
	sed -i '' 's/initialBlock: [0-9]*/initialBlock: $(2)/' substreams.yaml && \
	sed -i '' 's/network: solana[-a-z]*/network: $(1)/' substreams.yaml && \
	sed -i '' 's/type: proto:.*/type: proto:$(3)/' substreams.yaml && \
	sed -i '' 's/name: map_transfer_events.*/name: $(4)/' substreams.yaml && \
	substreams build
endef

define deploy-substream-mongo
	$(call build-substream,$(1),$(3),sf.substreams.sink.database.v1.DatabaseChanges,map_transfer_events_to_db)
	cp -f substreams/graph/m-token-transactions-v0.1.0.spkg substreams/db/m-token-transactions.spkg
	docker build --platform linux/amd64 -t ghcr.io/m0-foundation/solana-m:substream-mongo-$(2) -f substreams/db/Dockerfile .
	docker push ghcr.io/m0-foundation/solana-m:substream-mongo-$(2)
	railway redeploy --service substream-mongo --yes
endef

build-substream-mongo-mainnet:
	$(call build-substream,solana-mainnet-beta,$(MAINNET_STARTING_BLOCK),sf.substreams.sink.database.v1.DatabaseChanges,map_transfer_events_to_db)
	cp -f substreams/graph/m-token-transactions-v0.1.0.spkg substreams/db/m-token-transactions.spkg

deploy-substream-mongo-devnet:
	railway environment development
	$(call deploy-substream-mongo,solana-devnet,devnet,$(DEVNET_STARTING_BLOCK))

deploy-substream-mongo-mainnet:
	railway environment production
	$(call deploy-substream-mongo,solana-mainnet-beta,mainnet,$(MAINNET_STARTING_BLOCK))

#
# SDKs
#
publish-sdk:
	@cd sdk && \
	pnpm build && \
	echo "//registry.npmjs.org/:_authToken=$(shell op read "op://Web3/NPM Publish Token m0-foundation/credential")" > .npmrc && \
	pnpm publish --no-git-checks && \
	rm .npmrc

publish-api-sdk:
	@cd services/api/sdk-ts && \
	pnpm build && \
	echo "//registry.npmjs.org/:_authToken=$(shell op read "op://Web3/NPM Publish Token m0-foundation/credential")" > .npmrc && \
	pnpm publish --no-git-checks && \
	rm .npmrc
