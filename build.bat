type json-schema.schema.json |deno run main.ts --dts > json-schema.d.ts
deno fmt --options-indent-width 4 json-schema.d.ts
