'use client';

import { Button } from '../../design-system/primitives';
import { resetTours } from '../_data/tour';

/** Help's "Take the tour": offer both tours again, starting at the desk. */
export function TourReplay() {
  return <Button variant="secondary" onClick={() => void resetTours().then(() => window.location.assign('/'))}>Take the tour</Button>;
}
