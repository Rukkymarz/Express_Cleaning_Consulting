// Build success alone does not validate Next's runtime route tree.
const {spawn}=require('node:child_process');
const {createServer}=require('node:net');
const {existsSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');

async function main(){
  const serverFile=resolve('.next/standalone/server.js');
  assert.ok(existsSync(serverFile),'Build the standalone production server first.');
  const probe=createServer();
  await new Promise((ok,no)=>{probe.once('error',no);probe.listen(0,'127.0.0.1',ok);});
  const port=probe.address().port;
  await new Promise(ok=>probe.close(ok));
  const child=spawn(process.execPath,[serverFile],{env:{...process.env,NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  let output='';
  const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);
  try{
    await new Promise((ok,no)=>{
      child.once('error',no);
      child.once('exit',code=>no(new Error(`Production server exited before readiness (${code}). ${output}`)));
      child.stdout.on('data',d=>{output+=d;if(output.includes('Ready'))ok();});
      child.stderr.on('data',d=>{output+=d;});
    });
    const paths=['/','/book','/services','/services/house-cleaning','/services/deep-cleaning','/services/move-out-cleaning','/services/airbnb-turnover-cleaning','/services/apartment-turnover-cleaning','/services/post-construction-cleaning','/services/office-cleaning','/services/pressure-washing','/services/junk-removal','/sitemap.xml','/robots.txt'];
    for(const path of paths){
      const response=await fetch(`http://127.0.0.1:${port}${path}`,{signal:AbortSignal.timeout(5000),redirect:'manual'});
      assert.equal(response.status,200,`Production ${path} must return 200. ${output}`);
      const body=await response.text();
      assert.ok(body.length>0,`Production ${path} returned an empty body.`);
      if(path.startsWith('/services/'))assert.ok(body.includes('rel="canonical"'),`Missing canonical on ${path}`);
    }
    assert.ok(!/unhandledRejection|different slug names/.test(output),output);
    console.log(`Production startup and ${paths.length} public routes passed.`);
  }finally{
    clearTimeout(timeout);
    const exited=child.exitCode!==null||child.signalCode!==null;
    if(!exited){const closed=new Promise(ok=>child.once('exit',ok));child.kill('SIGTERM');await closed;}
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
