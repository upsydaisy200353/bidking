import type { AuctionSnapshot } from '../auction/types.js';
import { getOnlineCaptainIds } from './presence.js';

export function enrichAdminSnapshot(snapshot: AuctionSnapshot): AuctionSnapshot {
  return {
    ...snapshot,
    onlineCaptainIds: getOnlineCaptainIds(),
  };
}
