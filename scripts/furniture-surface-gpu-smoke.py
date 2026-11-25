#!/usr/bin/env python3
"""Offline WebGL2 diagnostic using locally extracted original asset streams.
Requires local Python Playwright, Chromium and TypeScript. Not a CI gate,
production renderer, save-file reader, or native pixel parity claim.
Linux software GPU: xvfb-run -a python scripts/furniture-surface-gpu-smoke.py ...
"""
import argparse, base64, hashlib, json, shutil, subprocess, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--mesh-dir',type=Path,required=True);p.add_argument('--base-dir',type=Path,required=True);p.add_argument('--pattern-dir',type=Path,required=True)
    p.add_argument('--chromium',required=True);p.add_argument('--headed',action='store_true');p.add_argument('--swiftshader',action='store_true');p.add_argument('--screenshot',type=Path)
    a=p.parse_args();repo=Path(__file__).resolve().parent.parent
    def read(name):return json.loads((repo/'data'/name).read_text())
    source={'base':read('furniture-base-material-source-v3.0.1.json'),'patterns':read('furniture-pattern-texture-sample-v3.0.1.json'),'geometry':read('furniture-mesh-source-sample-v3.0.1.json'),'camera':read('furniture-preview-camera-v3.0.1.json'),'materials':[r for r in read('furniture-material-render-source-v3.0.1.json')['rows'] if 207<=r[0]<=212]}
    paths={}
    for t in source['base']['textures'].values():paths[t['sha256']+'.texture.bin']=a.base_dir/(t['sha256']+'.texture.bin')
    for t in source['patterns']['rows']:paths[t['guid']+'.texture.bin']=a.pattern_dir/(t['guid']+'.texture.bin')
    for m in source['geometry']['rows']:paths[str(m['itemId'])+'.geometry.bin']=a.mesh_dir/(str(m['itemId'])+'.geometry.bin')
    def read_staged(name):return base64.b64encode(paths[name].read_bytes()).decode()
    def digest_staged(s):return base64.b64encode(hashlib.sha256(base64.b64decode(s)).digest()).decode()
    with tempfile.TemporaryDirectory() as td:
        out=Path(td);local=repo/'node_modules/typescript/bin/tsc';tsc=['node',str(local)] if local.is_file() else [shutil.which('tsc') or 'tsc']
        subprocess.run(tsc+['--target','ES2022','--module','ES2022','--lib','ES2022,DOM','--strict','--skipLibCheck',str(repo/'src/native-furniture-mesh.ts'),str(repo/'src/native-texture-upload.ts'),'--outDir',td],check=True)
        mesh=(out/'native-furniture-mesh.js').read_text().replace('export ','');tex=(out/'native-texture-upload.js').read_text().replace('export ','')
        smoke=(repo/'scripts/furniture-surface-gpu-smoke.mjs').read_text()
        program='async source=>{const {uploadNativeGeometry}=(()=>{'+mesh+'\nreturn {uploadNativeGeometry};})();const {uploadNativeTexture}=(()=>{'+tex+'\nreturn {uploadNativeTexture};})();\n'+smoke+'''
// about:blank is not a secure origin. Only the offline test's SHA-256 is
// supplied by the local host. Production code still requires Web Crypto.
if(!crypto.subtle)Object.defineProperty(crypto,'subtle',{value:{digest:async (alg,b)=>{if(alg!=='SHA-256')throw Error(alg);const a=new Uint8Array(b);let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return Uint8Array.from(atob(await digestStaged(btoa(s))),c=>c.charCodeAt(0)).buffer;}}});
return runFurnitureSurfaceGpuSmoke(source,readStaged,uploadNativeGeometry,uploadNativeTexture);}
'''
        with sync_playwright() as playwright:
            args=['--no-sandbox','--disable-dev-shm-usage']
            if a.swiftshader:args+=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
            browser=playwright.chromium.launch(executable_path=a.chromium,headless=not a.headed,args=args)
            try:
                page=browser.new_page();page.set_content('<canvas width="512" height="512"></canvas>');page.expose_function('readStaged',read_staged);page.expose_function('digestStaged',digest_staged)
                result=page.evaluate(program,source);print(json.dumps(result,indent=2));assert result['status']=='ok',result
                assert len(result['textures'])==19 and len(result['meshes'])==11 and len(result['variants'])==6
                if a.screenshot:page.locator('canvas').screenshot(path=str(a.screenshot))
            finally:browser.close()
if __name__=='__main__':main()
