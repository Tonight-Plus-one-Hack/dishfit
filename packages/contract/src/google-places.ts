/** Google Places is off unless the deployment explicitly opts in. */
export function googlePlacesEnabled(value: string | undefined): boolean {
  return value === 'on';
}
