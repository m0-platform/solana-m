## M0 Solana API

The API is built using [Fern](https://github.com/fern-api/fern)

> Fern is a toolkit that allows you to input your API Definition and output SDKs and API documentation. Fern is compatible with the OpenAPI specification (formerly Swagger).

The `fern` directory contains the api definitions which fern uses to generated the code within `sdk` and `server`. To add or modify an endpoint, update or add the respective service definition file in `fern/definitions` and then run `make generate-api-code` (make sure to use the `--local` flag when generating code else it do it remotely and ask for fern credentials).

```
.
└── api
    ├── fern
    │   ├── definitions
    │   │   ├── api.yml
    │   │   └── events.yml
    │   ├── fern.config.json
    │   └── generators.yml
    ├── sdk
    │   ├── generated ⚙️
    │   └── package.json
    └── server
        ├── generated ⚙️
        ├── openapi ⚙️
        ├── src
        └── package.json

⚙️ generated code
```

The SDK code requires no additional implementation but the server code requires you to implement each service and register its handler.

```ts
import { register } from '../generated';

const app = express();
register(app, { events });
```

An OpenAPI schema is generated at `server/openapi` and it served on the api at `/docs/schema.json`. The API also hosts a frontend for documentation using this schema file.
