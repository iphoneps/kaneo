import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  type DeviceRequestState,
  toDeviceRequestState,
} from "./device-request";

// Claims the code for the signed-in user (GET /device) and loads the client
// and scopes it asks for, so they are on screen before anyone approves.
export function useDeviceRequest(
  userCode: string,
  enabled: boolean,
): DeviceRequestState {
  const [state, setState] = useState<DeviceRequestState>({ state: "loading" });

  useEffect(() => {
    if (!enabled || !userCode) return;
    let cancelled = false;
    setState({ state: "loading" });
    authClient
      .device({ query: { user_code: userCode } })
      .then((response) => {
        if (!cancelled) setState(toDeviceRequestState(response));
      })
      .catch(() => {
        if (!cancelled) setState({ state: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, userCode]);

  return state;
}
