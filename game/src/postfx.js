import * as THREE from 'three';
import { EffectComposer } from '../vendor/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from '../vendor/three/examples/jsm/postprocessing/FXAAPass.js';
import { SSAOPass } from '../vendor/three/examples/jsm/postprocessing/SSAOPass.js';

/** HDR path: render → SSAO → bloom → FXAA → output. */
export function createPostfx(renderer, scene, camera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const ssao = new SSAOPass(scene, camera, size.x, size.y);
  ssao.kernelRadius = 8;
  ssao.minDistance = 0.001;
  ssao.maxDistance = 0.08;
  ssao.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.28, 0.6, 0.85);
  composer.addPass(bloom);

  const fxaa = new FXAAPass();
  composer.addPass(fxaa);

  composer.addPass(new OutputPass());

  function resize(w, h) {
    composer.setSize(w, h);
    ssao.setSize(w, h);
    bloom.setSize(w, h);
    const pr = renderer.getPixelRatio();
    fxaa.material.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
  }
  resize(size.x, size.y);

  return {
    composer,
    render() { composer.render(); },
    resize,
    setBloom(strength) { bloom.strength = strength; },
  };
}
