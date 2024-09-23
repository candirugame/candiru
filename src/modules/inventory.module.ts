import * as RENDERER from './ren.module.ts';
import * as INPUT from './input.module';
import {BananaGun} from '../HeldItem/BananaGun.ts';
import {HeldItemInput} from "../HeldItem/HeldItemInput";

const bananaGun = new BananaGun(RENDERER.getHeldItemScene());

export function init(){
bananaGun.init();
}

export function onFrame(){
bananaGun.onFrame(new HeldItemInput(INPUT.getLeftMouseDown(),INPUT.getRightMouseDown(),false));
}