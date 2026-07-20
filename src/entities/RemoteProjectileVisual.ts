import Phaser from 'phaser';
import { CONSTANTS } from '../systems/Constants';

export default class RemoteProjectileVisual extends Phaser.GameObjects.Container {
    constructor(scene: Phaser.Scene, projectileKey: string, team: 'blue' | 'red') {
        super(scene, 0, 0);
        scene.add.existing(this);
        this.setDepth(CONSTANTS.DEPTH.PROJECTILE);
        const isBlue = team === 'blue';
        if (projectileKey.includes('spear')) {
            const shaft = scene.add.rectangle(-2, 0, 22, 2.4, 0xb78a52, 1);
            const tip = scene.add.triangle(11, 0, 0, -3.2, 7.2, 0, 0, 3.2, isBlue ? 0xf0fbff : 0xffefe3, 1);
            tip.setStrokeStyle(1, 0x31415a, 0.55);
            const feather = scene.add.triangle(-14, 0, 0, -2.8, -4.2, 0, 0, 2.8, isBlue ? 0x4fa0ff : 0xff5a4f, 1);
            this.add([shaft, tip, feather]);
        } else if (projectileKey.includes('cannon')) {
            const shadow = scene.add.circle(1, 2, 7, 0x11131a, 0.55);
            const shell = scene.add.circle(0, 0, 6, 0x252b36, 1);
            shell.setStrokeStyle(2, 0x8f98a8, 0.8);
            const glint = scene.add.circle(-2, -2, 1.5, 0xffffff, 0.75);
            this.add([shadow, shell, glint]);
        } else {
            const core = scene.add.circle(0, 0, 4, isBlue ? 0x8fd0ff : 0xff9f87, 1);
            const glow = scene.add.circle(0, 0, 8, isBlue ? 0x4a9cff : 0xff594f, 0.3);
            glow.setBlendMode(Phaser.BlendModes.ADD);
            this.add([glow, core]);
        }
    }

    public applyState(x: number, y: number, directionX: number, directionY: number) {
        this.setPosition(x, y);
        this.setRotation(Math.atan2(directionY, directionX));
    }
}
