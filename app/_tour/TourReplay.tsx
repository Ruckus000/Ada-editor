'use client';

import { Button } from '../../design-system/primitives';
import { resetTours } from '../_data/tour';
import { DESK } from '../_site/routes';

/** Help's "Take the tour": offer both tours again, starting at the desk. */
export function TourReplay() {
  return <Button variant="secondary" onClick={() => void resetTours().then(() => window.location.assign(DESK))}>Take the tour</Button>;
}
