// Runs before first paint (see the root layout): app builds without the Apple plugin
// get <html data-no-apple>, which hides every [data-apple] block via CSS.
// Mirrors isNativeAppleAvailable().
export const NO_APPLE_SCRIPT =
  '(function(){try{var c=window.Capacitor;' +
  'var n=!!(c&&c.isNativePlatform&&c.isNativePlatform())||navigator.userAgent.indexOf("PadelmaestroApp/")>-1;' +
  'if(n&&!(c&&c.Plugins&&c.Plugins.AppleSignIn))document.documentElement.setAttribute("data-no-apple","")}catch(e){}})()';
