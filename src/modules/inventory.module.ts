import * as RENDERER from './ren.module.ts';
import {BananaGun} from '../HeldItem/BananaGun.ts'

const bananaGun = new BananaGun(RENDERER.getHeldItemScene());

export function init(){
bananaGun.init()
}

export function onFrame(){
bananaGun.onFrame()
}