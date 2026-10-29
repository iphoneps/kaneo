import { useTranslation } from "react-i18next";
import { type DeviceRequestState, deviceClientNameKey } from "./device-request";

type Props = {
  request: DeviceRequestState;
};

export function DeviceRequestDetails({ request }: Props) {
  const { t } = useTranslation();

  if (request.state === "loading") {
    return (
      <p className="text-center text-muted-foreground text-sm" role="status">
        {t("auth:device.approve.loading")}
      </p>
    );
  }

  if (request.state === "other-account") {
    return (
      <p className="text-center text-destructive text-sm" role="alert">
        {t("auth:device.approve.otherAccount")}
      </p>
    );
  }

  if (request.state === "failed") {
    return (
      <p className="text-center text-destructive text-sm" role="alert">
        {request.message ?? t("auth:device.approve.loadFailed")}
      </p>
    );
  }

  const { clientId, scopes } = request.request;
  const nameKey = deviceClientNameKey(clientId);

  return (
    <dl className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 text-sm dark:bg-input/16">
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground text-xs">
          {t("auth:device.approve.client")}
        </dt>
        <dd className="text-foreground">
          {nameKey ? t(nameKey) : clientId}
          {nameKey && (
            <span className="ml-2 font-mono text-muted-foreground text-xs">
              {clientId}
            </span>
          )}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground text-xs">
          {t("auth:device.approve.scopes")}
        </dt>
        <dd className="text-foreground">
          {scopes.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {scopes.map((scope) => (
                <li
                  key={scope}
                  className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs"
                >
                  {scope}
                </li>
              ))}
            </ul>
          ) : (
            t("auth:device.approve.noScopes")
          )}
        </dd>
      </div>
    </dl>
  );
}
