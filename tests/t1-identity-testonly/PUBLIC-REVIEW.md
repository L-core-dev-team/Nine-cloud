# T1 development review subset — TEST_ONLY

Source: 569b1de9cb010ba41dafc563484566c55a28fd67. Base: 290fa6f0ebd355792ea07bd125d5343053147e86.

The original chain remains preserved locally: fa689153 -> 7fdfd7e -> 3ef4e3f -> d995ae3 -> 30f0877 -> 569b1de. This public commit extracts the five application/test source files and the lifecycle-lock prototype unchanged. It does not preserve those six commit identities as ancestors.

Private-path-dependent harnesses, machine identity evidence and local logs are excluded. Historical test results were not rerun for this publication-only operation; this subset is not a self-contained PostgreSQL test environment. No new passing test claim is made. Erasure host closure, protected transaction integration, production role installation and migration approval remain incomplete. The lock function requires a separately provisioned NOLOGIN owner; its arguments do not authenticate tenants. Application owner/session checks remain required. UPDATE(generation_id) is not approved by this package. Production hosts are not newly enabled.

The SQL is an experimental review artifact, not registered in the migration journal and must not be automatically executed. This is not a production acceptance or merge recommendation.
