"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Intercom should only appear on support surfaces — it's intrusive on the rest
// of the app. We only inject the widget script on these paths, and shut the
// messenger down when the user navigates away from them.
const INTERCOM_PATHS = ["/help", "/contact", "/support"];
const APP_ID = "f1vga504";

type IntercomWindow = Window & { Intercom?: (command: string, ...args: unknown[]) => void };

function isSupportPath(pathname: string): boolean {
  return INTERCOM_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function IntercomLoader() {
  const pathname = usePathname();
  const show = isSupportPath(pathname);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as IntercomWindow;
    if (!show) {
      // Hide/teardown the messenger when leaving support pages.
      w.Intercom?.("shutdown");
    } else {
      w.Intercom?.("update", { app_id: APP_ID });
    }
  }, [show]);

  if (!show) return null;

  return (
    <>
      <Script id="intercom-settings" strategy="lazyOnload">
        {`window.intercomSettings = { api_base: "https://api-iam.intercom.io", app_id: "${APP_ID}" };`}
      </Script>
      <Script id="intercom-loader" strategy="lazyOnload">
        {`(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/${APP_ID}';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x);};if(document.readyState==='complete'){l();}else if(w.attachEvent){w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}})();`}
      </Script>
    </>
  );
}
