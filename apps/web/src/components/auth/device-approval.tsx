import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

const knownClientNames: Record<string, string> = {
  "kaneo-cli": "Kaneo CLI",
  "kaneo-mcp": "Kaneo MCP server",
};

type DeviceRequest = {
  clientId: string;
  scopes: string[];
  status: string;
};

type Props = {
  userCode: string;
  onDone: () => void;
};

function parseScopes(scope: unknown) {
  if (typeof scope !== "string") return [];
  return scope.split(/\s+/).filter(Boolean);
}

export function DeviceApproval({ userCode, onDone }: Props) {
  const [request, setRequest] = useState<DeviceRequest | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRequest(null);
    setLoadError(null);

    // GET /device claims the code for the signed-in user and returns the
    // requesting client and scopes, but only to the user who claimed it. The
    // user must see both before approving (GHSA-q84f-53jg-9ppm).
    authClient
      .device({ query: { user_code: userCode } })
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setLoadError(
            res.error.error_description ?? "Invalid or expired code",
          );
          return;
        }
        const clientId = res.data?.client_id;
        if (!clientId) {
          setLoadError("This request belongs to another account.");
          return;
        }
        setRequest({
          clientId,
          scopes: parseScopes(res.data.scope),
          status: res.data.status,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load the device request.");
      });

    return () => {
      cancelled = true;
    };
  }, [userCode]);

  const canDecide = request?.status === "pending" && !processing;

  const handleApprove = async () => {
    setProcessing(true);
    try {
      const res = await authClient.device.approve({ userCode });
      if (res.error) {
        toast.error(res.error.error_description ?? "Could not approve");
        return;
      }
      toast.success("Device connected");
      onDone();
    } catch {
      toast.error("Could not approve");
    } finally {
      setProcessing(false);
    }
  };

  const handleDeny = async () => {
    setProcessing(true);
    try {
      const res = await authClient.device.deny({ userCode });
      if (res.error) {
        toast.error(res.error.error_description ?? "Could not deny");
        return;
      }
      toast.message("Request cancelled");
      onDone();
    } catch {
      toast.error("Could not deny");
    } finally {
      setProcessing(false);
    }
  };

  const clientName = request ? knownClientNames[request.clientId] : undefined;

  return (
    <div className="space-y-4">
      <p className="text-center font-mono text-sm tracking-wide">{userCode}</p>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : !request ? (
        <p className="text-sm text-muted-foreground">Loading request…</p>
      ) : (
        <>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Application</dt>
              <dd className="font-medium">
                {clientName ? `${clientName} ` : null}
                <span className="font-mono text-xs text-muted-foreground">
                  {request.clientId}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Requested scopes</dt>
              <dd>
                {request.scopes.length > 0 ? (
                  <ul className="font-mono text-xs">
                    {request.scopes.map((scope) => (
                      <li key={scope}>{scope}</li>
                    ))}
                  </ul>
                ) : (
                  "None"
                )}
              </dd>
            </div>
          </dl>
          {request.status !== "pending" ? (
            <p className="text-sm text-muted-foreground">
              This request was already {request.status}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Approve only if you started this sign-in yourself. The device gets
              full access to your Kaneo account.
            </p>
          )}
        </>
      )}

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={!canDecide}
          onClick={() => void handleApprove()}
        >
          Approve
        </Button>
        <Button
          variant="outline"
          disabled={!canDecide}
          onClick={() => void handleDeny()}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
