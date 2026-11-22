import { catalogs, translate, type MessageKey } from '../../i18n'
import { ApiRequestError } from '../../data/api'

/** Why the upload is paused (GET /api/submissions/config uploadsPaused, or a 503 on send). */
export const UPLOADS_PAUSED = {
  daily_limit: { get title() { return translate('weHaveEnoughPhotosForToday') }, get body() { return translate('weveReceivedALotOfMenus') } },
  unavailable: { get title() { return translate('photoUploadsAreCurrentlyUnavailable') }, get body() { return translate('tryAgainLaterInTheMeantime') } },
} as const

const rejectionKeys = [
  'rejectionFaces', 'rejectionContent', 'rejectionNotMenu', 'rejectionDuplicatePhoto',
  'rejectionAlreadyOnline', 'rejectionOutsideBerlin', 'rejectionPrices', 'rejectedByTeam',
] as const satisfies readonly MessageKey[]

/** The Worker sends existing review reasons as text, including free-form notes from the review team. */
export function rejectionText(reason: string | null): string {
  if (!reason) return translate('thePhotoDoesntMeetTheRequirements')
  const key = rejectionKeys.find((key) => catalogs.de[key] === reason)
  if (key) return translate(key)
  const restaurant = /^Die Speisekarte gehört zu einem anderen Restaurant \((.+)\)\.$/.exec(reason)
  return restaurant ? translate('rejectionOtherRestaurant', restaurant[1]) : reason
}

/** Localized submission errors based on the Worker's status and error code. */
export function submitErrorText(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return translate('somethingWentWrong')
  if (error.code === 'storage_limit') return UPLOADS_PAUSED.daily_limit.body
  if (error.code === 'unavailable' && error.status === 503) return UPLOADS_PAUSED.unavailable.title
  switch (error.status) {
    case 0:
      return translate('messagesNoConnectionCheckYourConnectionAnd')
    case 413:
      return translate('thePhotoIsTooLargeMax')
    case 415:
      return translate('jpegPngOrWebpOnly')
    case 429:
      return translate('tooManyUploadsTryAgainLater')
    case 403:
      return translate('securityCheckFailed')
    case 502:
    case 503:
    case 504:
      return translate('currentlyUnavailableTryAgainInA')
    default:
      return translate('somethingWentWrong')
  }
}
