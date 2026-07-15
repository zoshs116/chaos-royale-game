export type ButtonTone = 'primary' | 'gold' | 'green' | 'dark' | 'purple';

export const BUTTON_TONES: ButtonTone[] = ['primary', 'gold', 'green', 'dark', 'purple'];

export const UI_ATLAS_IMAGES = [
    ...BUTTON_TONES.flatMap((tone) => [
        `ui_asset_button_${tone}`,
        `ui_asset_button_${tone}_pressed`,
    ]),
    'ui_asset_panel_dark',
    'ui_asset_header_bar',
    'ui_asset_currency_pill',
    'ui_asset_nav_bar',
    'ui_asset_nav_active',
    'ui_asset_slot_empty',
    'ui_asset_slot_locked',
    'ui_asset_toast_panel',
    'ui_asset_card_blue',
    'ui_asset_card_green',
    'ui_asset_card_red',
    'ui_asset_card_purple',
    'ui_asset_card_gold',
] as const;

export const uiAtlasPath = (key: string) => `assets/ui/atlas/${key}.png`;

