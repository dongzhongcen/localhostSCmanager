import { trpc } from "@/providers/trpc";

export function useServiceStatuses(pollInterval = 3000) {
  const { data } = trpc.service.statuses.useQuery(undefined, {
    refetchInterval: pollInterval,
  });
  return data ?? {};
}
