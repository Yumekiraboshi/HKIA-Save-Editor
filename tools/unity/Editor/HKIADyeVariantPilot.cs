// Copyright (c) HKIA Save Editor contributors.
// Unity Editor diagnostic renderer. Place this under Assets/Editor in a
// throwaway Unity project that is compatible with the source AssetBundle.
// It NEVER publishes to public/variant-art or claims shader-exact output.
// Run Unity -batchmode -quit -projectPath <project> -executeMethod
// HKIADyeVariantPilot.Run --hkia-job <job.json> --hkia-bundle <UnityFS bundle>
// --hkia-preview <absolute staging png> --hkia-allow-unverified-preview
#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;

public static class HKIADyeVariantPilot
{
    [Serializable] private sealed class BundleRef
    {
        public string bundle;
        public string sha256;
    }
    [Serializable] private sealed class Palette
    {
        public int dye;
        public string[] colors;
    }
    [Serializable] private sealed class Job
    {
        public string schema;
        public int itemId;
        public string prefabGameObject;
        public BundleRef originalUnityFS;
        public Palette palette;
        public bool publishable;
        public NativeMaterial nativeMaterial;
        public string[] dependencyBundleNames;
        public BundleRef[] dependencyHashes;
    }
    [Serializable] private sealed class NativeMaterial
    {
        public string name;
        public string shader;
        public TextureRef[] textures;
    }
    [Serializable] private sealed class TextureRef
    {
        public string property;
        public string name;
    }

    private static string Arg(string[] all, string key)
    {
        int index=Array.IndexOf(all,key);
        if (index < 0 || index+1 >= all.Length)
            throw new InvalidOperationException("Missing "+key);
        return all[index+1];
    }
    private static IEnumerable<string> AllArgs(string[] args,string flag)
    {
        for(int i=0;i+1<args.Length;i++)
            if(args[i]==flag) yield return args[i+1];
    }
    private static void Require(bool ok,string message)
    {
        if (!ok) throw new InvalidOperationException(message);
    }
    private static string Hash(string path)
    {
        using (var sha=SHA256.Create())
        using (var stream=File.OpenRead(path))
            return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
    }

    private static Bounds FindBounds(Renderer[] renderers)
    {
        Bounds bounds=renderers[0].bounds;
        for(int i=1;i<renderers.Length;i++)bounds.Encapsulate(renderers[i].bounds);
        Require(bounds.size.sqrMagnitude>0.000001f,"HKIA_RENDER_NO_VALID_BOUNDS");
        return bounds;
    }

    // This is intentionally a diagnostic implementation. Reproducing the
    // game's full shader graph and all external Material dependencies is
    // mandatory before marking any family publishable.
    public static void Run()
    {
        GameObject instance=null,camObject=null,lightObject=null;
        AssetBundle bundle=null;
        var dependencies=new List<AssetBundle>();
        var createdMaterials=new List<Material>();
        RenderTexture target=null;
        RenderTexture oldActive=RenderTexture.active;
        try
        {
            string[] args=Environment.GetCommandLineArgs();
            var jobPath=Arg(args,"--hkia-job");
            var bundlePath=Arg(args,"--hkia-bundle");
            var previewPath=Arg(args,"--hkia-preview");
            var previewFull=Path.GetFullPath(previewPath).Replace('\\','/');
            Require(previewFull.Contains("/staging/"),
                "HKIA_RENDER_OUTPUT_MUST_BE_IN_STAGING");
            var unsafePreview=Array.IndexOf(args,"--hkia-allow-unverified-preview")>=0;
            var job=JsonUtility.FromJson<Job>(File.ReadAllText(jobPath));
            Require(job!=null && job.schema=="HKIA.DyeRenderJob.1",
                "HKIA_RENDER_JOB_SCHEMA");
            Require(job.originalUnityFS!=null && job.palette!=null &&
                job.palette.colors!=null && job.palette.colors.Length==5,
                "HKIA_RENDER_JOB_PALETTE");
            Require(Path.GetFileNameWithoutExtension(bundlePath)==job.originalUnityFS.bundle,
                "HKIA_RENDER_SOURCE_BUNDLE");
            Require(string.Equals(Hash(bundlePath),job.originalUnityFS.sha256,
                StringComparison.OrdinalIgnoreCase),
                "HKIA_RENDER_SOURCE_SHA256_MISMATCH");
            Require(job.publishable || unsafePreview,
                "HKIA_RENDER_UNVERIFIED_MATERIALS_BLOCK_PUBLICATION");

            // Load original UnityFS dependencies before instantiating the
            // source prefab. Only explicitly supplied local files are used.
            // The CAB resolver must identify these ahead of time.
            var dependencyPaths=AllArgs(args,"--hkia-dependency").ToArray();
            if(job.nativeMaterial!=null)
            {
                Require(job.dependencyBundleNames!=null&&job.dependencyHashes!=null,
                    "HKIA_RENDER_DEPENDENCY_MANIFEST_MISSING");
                var supplied=dependencyPaths.Select(Path.GetFileNameWithoutExtension).ToArray();
                Require(supplied.Distinct(StringComparer.Ordinal).Count()==supplied.Length &&
                    new HashSet<string>(supplied,StringComparer.Ordinal)
                        .SetEquals(job.dependencyBundleNames),
                    "HKIA_RENDER_DEPENDENCY_SET_MISMATCH");
                foreach(var expected in job.dependencyHashes)
                {
                    var matching=dependencyPaths.Single(p=>Path.GetFileNameWithoutExtension(p)==expected.bundle);
                    Require(Hash(matching)==expected.sha256,
                        "HKIA_RENDER_DEPENDENCY_SHA256_MISMATCH "+expected.bundle);
                }
            }
            foreach(string dependencyPath in dependencyPaths)
            {
                Require(File.Exists(dependencyPath),"HKIA_RENDER_DEPENDENCY_FILE_MISSING");
                Require(Path.GetFullPath(dependencyPath)!=Path.GetFullPath(bundlePath),
                    "HKIA_RENDER_DEPENDENCY_REPEATS_ROOT_BUNDLE");
                var external=AssetBundle.LoadFromFile(dependencyPath);
                Require(external!=null,"HKIA_RENDER_DEPENDENCY_LOAD_FAILED "+dependencyPath);
                dependencies.Add(external);
            }
            bundle=AssetBundle.LoadFromFile(bundlePath);
            Require(bundle!=null,"HKIA_RENDER_UNITYFS_LOAD_FAILED");
            var prefabs=bundle.LoadAllAssets<GameObject>();
            var exact=prefabs.Where(p=>p.name==job.prefabGameObject).ToArray();
            Require(exact.Length==1,"HKIA_RENDER_EXACT_PREFAB_NOT_RESOLVED");
            instance=UnityEngine.Object.Instantiate(exact[0]);
            instance.name="HKIA_Staged_"+job.itemId;
            // Include rigid garment meshes as well as skinned meshes. The
            // pajama pants have only a MeshRenderer. Match the audited garment
            // Material, not the shared avatar/body Material on the shirt.
            var candidates=instance.GetComponentsInChildren<Renderer>(true)
                .Where(r=>r is MeshRenderer||r is SkinnedMeshRenderer).ToArray();
            Require(candidates.Length>0,"HKIA_RENDER_MESH_NOT_RESOLVED");
            string[] names={"_PaletteColor1","_PaletteColor2","_PaletteColor3",
                            "_PaletteColor4","_PaletteColor5"};
            var colors=new Color[5];
            var present=new bool[5];
            for(int c=0;c<5;c++)
            {
                // Native null means absent; leave the source Material default
                // intact instead of synthesizing a fifth or fourth color.
                if(string.IsNullOrEmpty(job.palette.colors[c])) continue;
                Require(ColorUtility.TryParseHtmlString(job.palette.colors[c],out colors[c]),
                        "HKIA_RENDER_PALETTE_COLOR_"+(c+1));
                present[c]=true;
            }
            Require(present.Any(v=>v),"HKIA_RENDER_NO_NATIVE_PALETTE_COLORS");
            int applied=0;
            var visible=new List<Renderer>();
            foreach(var renderer in candidates)
            {
                var originals=renderer.sharedMaterials;
                Require(originals!=null&&originals.Length>0,
                        "HKIA_RENDER_MATERIALS_NOT_RESOLVED");
                var replacements=(Material[])originals.Clone();
                bool garment=false;
                for(int m=0;m<originals.Length;m++)
                {
                    var origin=originals[m];
                    Require(origin!=null&&origin.shader!=null,
                            "HKIA_RENDER_EXTERNAL_MATERIAL_MISSING");
                    if(job.nativeMaterial!=null&&origin.name!=job.nativeMaterial.name)continue;
                    Require(origin.shader.isSupported &&
                        origin.shader.name!="Hidden/InternalErrorShader",
                        "HKIA_RENDER_NATIVE_SHADER_UNSUPPORTED");
                    if(job.nativeMaterial!=null)
                    {
                        Require(origin.shader.name==job.nativeMaterial.shader,
                            "HKIA_RENDER_NATIVE_SHADER_NAME_MISMATCH");
                        Require(job.nativeMaterial.textures!=null&&job.nativeMaterial.textures.Length==4,
                            "HKIA_RENDER_TEXTURE_MANIFEST_MISSING");
                        foreach(var expected in job.nativeMaterial.textures)
                        {
                            Require(origin.HasProperty(expected.property),
                                "HKIA_RENDER_NATIVE_MAP_MISSING "+expected.property);
                            var tex=origin.GetTexture(expected.property);
                            Require(tex!=null&&tex.name==expected.name,
                                "HKIA_RENDER_NATIVE_MAP_MISMATCH "+expected.property);
                        }
                    }
                    var material=new Material(origin);
                    createdMaterials.Add(material);
                    for(int c=0;c<5;c++)
                    {
                        Require(material.HasProperty(names[c]),
                                "HKIA_RENDER_SHADER_CHANNEL_MISSING "+names[c]);
                        if(present[c])material.SetColor(names[c],colors[c]);
                    }
                    Require(material.HasProperty("_BaseMap")&&material.GetTexture("_BaseMap")!=null,
                            "HKIA_RENDER_TEXTURE_NOT_RESOLVED");
                    replacements[m]=material;
                    garment=true;
                    applied++;
                }
                if(job.nativeMaterial!=null&&!garment)
                {
                    renderer.enabled=false;
                    continue;
                }
                renderer.sharedMaterials=replacements;
                renderer.gameObject.SetActive(true);
                renderer.enabled=true;
                visible.Add(renderer);
            }
            Require(applied>0,"HKIA_RENDER_NO_COLORIZED_MATERIALS");
            var renderers=visible.ToArray();
            Require(renderers.Length>0,"HKIA_RENDER_NO_RENDERERS");
            var bounds=FindBounds(renderers);
            camObject=new GameObject("HKIA_Staging_Camera");
            var camera=camObject.AddComponent<Camera>();
            camera.enabled=false;
            camera.clearFlags=CameraClearFlags.SolidColor;
            camera.backgroundColor=new Color(0,0,0,0);
            camera.orthographic=true;
            camera.orthographicSize=Mathf.Max(bounds.extents.y,bounds.extents.x)*1.2f;
            camera.nearClipPlane=0.01f;
            camera.farClipPlane=100f;
            camera.transform.position=bounds.center+new Vector3(0,0,-4-Mathf.Max(bounds.size.z,1f));
            camera.transform.LookAt(bounds.center);
            lightObject=new GameObject("HKIA_Staging_KeyLight");
            var keyLight=lightObject.AddComponent<Light>();
            keyLight.type=LightType.Directional;
            keyLight.intensity=1f;
            lightObject.transform.rotation=Quaternion.Euler(35,-25,0);
            target=new RenderTexture(512,512,24,RenderTextureFormat.ARGB32);
            target.Create();
            camera.targetTexture=target;
            camera.Render();
            RenderTexture.active=target;
            var pixels=new Texture2D(512,512,TextureFormat.RGBA32,false);
            pixels.ReadPixels(new Rect(0,0,512,512),0,0);
            pixels.Apply(false);
            var bytes=pixels.EncodeToPNG();
            UnityEngine.Object.DestroyImmediate(pixels);
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(previewPath)));
            File.WriteAllBytes(previewPath,bytes);
            Debug.Log("HKIA_DIAGNOSTIC_RENDER_CREATED "+previewPath+
                " materials="+applied+" (NOT validated for publication)");
        }
        catch(Exception e)
        {
            Debug.LogError("HKIA_RENDER_BLOCKED "+e);
            // In -batchmode this emits an actionable error and leaves no
            // misleading registered source image behind.
            EditorApplication.Exit(2);
            return;
        }
        finally
        {
            RenderTexture.active=oldActive;
            if(target!=null){target.Release();UnityEngine.Object.DestroyImmediate(target);}
            if(lightObject!=null)UnityEngine.Object.DestroyImmediate(lightObject);
            if(camObject!=null)UnityEngine.Object.DestroyImmediate(camObject);
            if(instance!=null)UnityEngine.Object.DestroyImmediate(instance);
            foreach(var material in createdMaterials)if(material!=null)UnityEngine.Object.DestroyImmediate(material);
            if(bundle!=null)bundle.Unload(false);
            foreach(var external in dependencies)if(external!=null)external.Unload(false);
        }
    }
}
#endif
