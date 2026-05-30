.DEFAULT_GOAL := help
HELP_SEPARATOR := ＠

PACKAGE_NAME := tab-flash-jump-hints
PACKAGE_TARGETS := manifest.json background.js popup.html popup.css popup.js options.html options.js lib/labels.js assets/icon128.png README.md LICENSE

.PHONY: help
help:  ## Show help
	@cat $(MAKEFILE_LIST) | \
		grep -E '^[-a-z]+:.*##' | \
		sed -e 's/:.*## /$(HELP_SEPARATOR)/' | \
		column -t -s $(HELP_SEPARATOR)

.PHONY: lint
lint:  ## Lint files
	npm run lint

.PHONY: format
format:  ## Format files
	npm run format

.PHONY: format-check
format-check:  ## Check if files are formatted
	npm run format-check

.PHONY: check
check:  ## Run all local checks
	npm run check

.PHONY: zip
zip:  ## Build a zip file for local sharing
	mkdir -p packages
	rm -f packages/$(PACKAGE_NAME).zip
	zip packages/$(PACKAGE_NAME) $(PACKAGE_TARGETS)
	open packages
