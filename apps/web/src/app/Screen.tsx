// The screen for each route. Shared by the phone layout and the desktop frame, so a route is registered once.
import { CameraScreen } from '../screens/camera/CameraScreen'
import { DishScreen } from '../screens/dish/DishScreen'
import { SearchScreen } from '../screens/filters/SearchScreen'
import { HomeScreen } from '../screens/home/HomeScreen'
import { DatenschutzScreen } from '../screens/legal/DatenschutzScreen'
import { ImpressumScreen } from '../screens/legal/ImpressumScreen'
import { MapScreen } from '../screens/map/MapScreen'
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen'
import { RestaurantScreen } from '../screens/restaurant/RestaurantScreen'
import { TodayScreen } from '../screens/today/TodayScreen'
import { SnapScreen } from '../screens/snap/SnapScreen'
import { SnapStatusScreen } from '../screens/snap/SnapStatusScreen'
import { LeaderboardScreen } from '../screens/community/LeaderboardScreen'
import { ProfileScreen } from '../screens/community/ProfileScreen'
import { WaitlistScreen } from '../screens/waitlist/WaitlistScreen'
import type { Route } from '../lib/routes'
import { NotFound } from './Boundary'

export function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />
    case 'map':
      return <MapScreen />
    case 'search':
      return <SearchScreen />
    case 'today':
      return <TodayScreen />
    case 'onboarding':
      return <OnboardingScreen />
    case 'restaurant':
      return <RestaurantScreen id={route.id} />
    case 'dish':
      return <DishScreen id={route.id} />
    case 'camera':
      return <CameraScreen />
    case 'notFound':
      return <NotFound />
    case 'snap':
      return <SnapScreen />
    case 'snapStatus':
      return <SnapStatusScreen id={route.id} />
    case 'me':
      return <ProfileScreen />
    case 'leaderboard':
      return <LeaderboardScreen />
    case 'impressum':
      return <ImpressumScreen />
    case 'datenschutz':
      return <DatenschutzScreen />
    case 'waitlist':
      return <WaitlistScreen />
  }
}
