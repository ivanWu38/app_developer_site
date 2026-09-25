export const APP_NAME = '串門運動';
export const APP_VERSION = '1.0 web';
export const APP_URL = 'https://ikuheikure.xyz/apps/peerfit/app/';
export const SHORT_URL = 'ikuheikure.xyz/peerfit';       // /peerfit/ redirects to the app
export const APP_STORE_ID = '6809310975';
export const FEEDBACK_EMAIL = 'wuyuping38@gmail.com';
export const PRIVACY_URL = 'https://ikuheikure.xyz/apps/peerfit/#privacy';
export const isStandalone = () => window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
