import { Component } from '@angular/core';
import {GameComponent} from "../game/game.component.ts";

@Component({
  selector: 'app-home',
  standalone: true,
  template: `<app-game></app-game>`,
  styles: ``,
  imports: [
    GameComponent
  ]
})
export default class HomeComponent {}
