#!/usr/bin/env python3
"""Offline staging helper tests, no original game files required."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

script=Path(__file__).with_name('stage-furniture-native-assets.py')
spec=importlib.util.spec_from_file_location('stage',script)
stage=importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)

class StageTest(unittest.TestCase):
    def test_manifest_bundle_closure(self):
        expected=stage.required_bundles(
            stage.read('furniture-base-material-source-v3.0.1.json'),
            stage.read('furniture-mesh-source-sample-v3.0.1.json'),
            stage.read('furniture-pattern-texture-sample-v3.0.1.json'),
            stage.read('furniture-light-region-source-v3.0.1.json'))
        self.assertEqual(len(expected),12)
        self.assertIn('l_decor_colo26_rug',expected)
        self.assertIn('networkedprototypes',expected)
        self.assertIn('l_decor_colo26_pattern_1',expected)

    def test_locate_nested_and_reject_wrong_version(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td)
            (root/'a').mkdir();(root/'b').mkdir()
            (root/'a'/'bundle').write_bytes(b'wrong version')
            good=root/'b'/'bundle.bin';good.write_bytes(b'correct version')
            digest=hashlib.sha256(b'correct version').hexdigest()
            self.assertEqual(stage.locate(root,{'bundle':digest}),{'bundle':good})
            stage.verify_file(good,len(b'correct version'),digest)
            with self.assertRaises(ValueError):
                stage.verify_file(good,1,digest)
            good.unlink()
            with self.assertRaises(ValueError):
                stage.locate(root,{'bundle':digest})

    def test_conflicting_source_hashes_reject(self):
        with self.assertRaises(ValueError):
            stage.required_bundles({'bundles':{'a':['same','a'*64]}},{'rows':[{'bundle':'same','bundleSha256':'b'*64}]},{'rows':[]},{'sceneSha256':'c'*64,'presetBundleSha256':'d'*64})

if __name__=='__main__':
    unittest.main()
