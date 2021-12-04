rem Move to root
copy /y json-schema.schema.json ..
del json-schema.schema.json

copy /y json-schema.d.ts ..
del json-schema.d.ts

copy /y json-schema.validate.js ..
del json-schema.validate.js
