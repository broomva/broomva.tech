.PHONY: smoke check test build clean install fmt

# Primary gate: must pass before commit
smoke: check test
	@echo "SMOKE PASS"

# Compile + lint
check:
	cargo check
	cargo clippy -- -D warnings

# Format check
fmt:
	cargo fmt -- --check

# Tests
test:
	cargo test

# Release build
build:
	cargo build --release

# Install binary locally
install: build
	cargo install --path . --bin broomva

# Clean build artifacts
clean:
	cargo clean

# Release: bump version, changelog, tag
release: smoke
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=0.2.0"; exit 1; fi
	sed -i.bak 's/^version = ".*"/version = "$(VERSION)"/' Cargo.toml && rm -f Cargo.toml.bak
	cargo check
	git add Cargo.toml Cargo.lock
	git commit -m "chore(release): broomva-cli v$(VERSION)"
	git tag "broomva-cli-v$(VERSION)"
	@echo "Tagged broomva-cli-v$(VERSION). Push with: git push && git push --tags"
