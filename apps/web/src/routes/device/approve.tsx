import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { z } from "zod/v4";
import { DeviceApproval } from "@/components/auth/device-approval";
import { AuthLayout } from "@/components/auth/layout";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const approveSearchSchema = z.object({
  user_code: z.string().optional(),
});

export const Route = createFileRoute("/device/approve")({
  component: DeviceApprovePage,
  validateSearch: approveSearchSchema,
});

function DeviceApprovePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/device/approve" });
  const { data: session, isPending } = authClient.useSession();

  const normalizedCode =
    search.user_code?.trim().replace(/-/g, "").toUpperCase() ?? "";

  if (isPending) {
    return (
      <AuthLayout title="Approve device" subtitle="Loading…">
        <div className="text-sm text-muted-foreground">Checking session…</div>
      </AuthLayout>
    );
  }

  if (!session?.user) {
    if (!normalizedCode) {
      return (
        <AuthLayout
          title="Approve device"
          subtitle="No device code was provided."
        >
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => void navigate({ to: "/device" })}
          >
            Enter a code
          </Button>
        </AuthLayout>
      );
    }
    const redirectTarget = `/device/approve?user_code=${encodeURIComponent(normalizedCode)}`;
    return (
      <AuthLayout
        title="Sign in to continue"
        subtitle="Sign in to approve or deny this device request."
      >
        <Button
          className="w-full"
          onClick={() =>
            void navigate({
              to: "/auth/sign-in",
              search: { redirect: redirectTarget },
            })
          }
        >
          Sign in
        </Button>
      </AuthLayout>
    );
  }

  if (!normalizedCode) {
    return (
      <AuthLayout
        title="Approve device"
        subtitle="No device code was provided."
      >
        <Button
          className="w-full"
          variant="secondary"
          onClick={() => void navigate({ to: "/device" })}
        >
          Enter a code
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Approve device"
      subtitle="A device is requesting access to your Kaneo account."
    >
      <DeviceApproval
        userCode={normalizedCode}
        onDone={() => void navigate({ to: "/dashboard" })}
      />
    </AuthLayout>
  );
}
