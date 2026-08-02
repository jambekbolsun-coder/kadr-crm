import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const root=path.resolve('src');const files=[]
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(p)&&!p.endsWith('.d.ts'))files.push(p)}}
walk(root);let errors=0
for(const file of files){const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});for(const d of result.diagnostics||[]){if(d.category===ts.DiagnosticCategory.Error){errors++;console.error(`${file}: ${ts.flattenDiagnosticMessageText(d.messageText,' ')}`)}}}
console.log(`Checked ${files.length} TS/TSX files; syntax errors: ${errors}`);process.exit(errors?1:0)
