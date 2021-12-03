rem Generate metaschema in JSON Schema format
deno run --allow-write=json-schema.schema.json build-schema-json.ts

rem Genreate TypeScript declaration
type json-schema.schema.json |deno run ../main.ts --dts > json-schema.d.ts
deno fmt --options-indent-width 4 json-schema.d.ts

rem Move to root
copy /y json-schema.schema.json ..
del json-schema.schema.json

copy /y json-schema.d.ts ..
del json-schema.d.ts
