import type { WaStatus } from '@/lib/database.types';
import { WA_STATUS_LABEL, WA_STATUS_TONE } from '@/lib/whatsapp';
import { Badge } from '@/components/ui/Card';

export function WaStatusBadge({ status }: { status: WaStatus }) {
  return <Badge tone={WA_STATUS_TONE[status]}>{WA_STATUS_LABEL[status]}</Badge>;
}
