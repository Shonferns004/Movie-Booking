import IconAlertCircle from '@tabler/icons-react/icons/IconAlertCircle';
import IconArrowRight from '@tabler/icons-react/icons/IconArrowRight';
import IconArrowUpRight from '@tabler/icons-react/icons/IconArrowUpRight';
import IconCalendarX from '@tabler/icons-react/icons/IconCalendarX';
import IconChevronDown from '@tabler/icons-react/icons/IconChevronDown';
import IconChevronLeft from '@tabler/icons-react/icons/IconChevronLeft';
import IconChevronRight from '@tabler/icons-react/icons/IconChevronRight';
import IconChevronUp from '@tabler/icons-react/icons/IconChevronUp';
import IconCircleCheck from '@tabler/icons-react/icons/IconCircleCheck';
import IconClock from '@tabler/icons-react/icons/IconClock';
import IconDownload from '@tabler/icons-react/icons/IconDownload';
import IconEdit from '@tabler/icons-react/icons/IconEdit';
import IconHeart from '@tabler/icons-react/icons/IconHeart';
import IconHourglass from '@tabler/icons-react/icons/IconHourglass';
import IconId from '@tabler/icons-react/icons/IconId';
import IconInfoCircle from '@tabler/icons-react/icons/IconInfoCircle';
import IconLoader2 from '@tabler/icons-react/icons/IconLoader2';
import IconLock from '@tabler/icons-react/icons/IconLock';
import IconLogout from '@tabler/icons-react/icons/IconLogout';
import IconMapPin from '@tabler/icons-react/icons/IconMapPin';
import IconMaximize from '@tabler/icons-react/icons/IconMaximize';
import IconMenu2 from '@tabler/icons-react/icons/IconMenu2';
import IconMessageCircle from '@tabler/icons-react/icons/IconMessageCircle';
import IconMotorbike from '@tabler/icons-react/icons/IconMotorbike';
import IconMovie from '@tabler/icons-react/icons/IconMovie';
import IconPhoto from '@tabler/icons-react/icons/IconPhoto';
import IconPhotoPlus from '@tabler/icons-react/icons/IconPhotoPlus';
import IconPlayerPlay from '@tabler/icons-react/icons/IconPlayerPlay';
import IconQrcode from '@tabler/icons-react/icons/IconQrcode';
import IconRosetteDiscountCheck from '@tabler/icons-react/icons/IconRosetteDiscountCheck';
import IconSearch from '@tabler/icons-react/icons/IconSearch';
import IconStar from '@tabler/icons-react/icons/IconStar';
import IconTicket from '@tabler/icons-react/icons/IconTicket';
import IconUser from '@tabler/icons-react/icons/IconUser';
import IconUsers from '@tabler/icons-react/icons/IconUsers';
import IconUsersGroup from '@tabler/icons-react/icons/IconUsersGroup';
import IconX from '@tabler/icons-react/icons/IconX';
import IconZoomIn from '@tabler/icons-react/icons/IconZoomIn';
import IconZoomOut from '@tabler/icons-react/icons/IconZoomOut';

/**
 * Material Symbols names used by the existing UI mapped to Tabler icons.
 * Keeping the names as keys means pages do not need to change their data
 * structures or dynamic icon expressions.
 */
const ICONS = {
  add_photo_alternate: IconPhotoPlus,
  arrow_back_ios_new: IconChevronLeft,
  arrow_forward: IconArrowRight,
  arrow_outward: IconArrowUpRight,
  badge: IconId,
  chat: IconMessageCircle,
  check_circle: IconCircleCheck,
  chevron_left: IconChevronLeft,
  chevron_right: IconChevronRight,
  close: IconX,
  confirmation_number: IconTicket,
  diversity_3: IconUsersGroup,
  download: IconDownload,
  edit: IconEdit,
  error: IconAlertCircle,
  event_busy: IconCalendarX,
  expand_less: IconChevronUp,
  expand_more: IconChevronDown,
  favorite_border: IconHeart,
  groups: IconUsers,
  hold: IconHourglass,
  hourglass_top: IconHourglass,
  info: IconInfoCircle,
  local_activity: IconTicket,
  location_on: IconMapPin,
  lock: IconLock,
  logout: IconLogout,
  menu: IconMenu2,
  movie: IconMovie,
  north_east: IconArrowUpRight,
  open_in_full: IconMaximize,
  person: IconUser,
  photo_library: IconPhoto,
  play_arrow: IconPlayerPlay,
  progress_activity: IconLoader2,
  qr: IconQrcode,
  schedule: IconClock,
  search: IconSearch,
  star: IconStar,
  two_wheeler: IconMotorbike,
  verified: IconRosetteDiscountCheck,
  zoom_in: IconZoomIn,
  zoom_out: IconZoomOut,
};

/**
 * Tabler icon that inherits size from the surrounding font-size by default.
 * That preserves the existing `text-[18px]`, `text-lg`, etc. spacing rules.
 */
export default function UiIcon({
  name,
  size = '1em',
  stroke = 1.8,
  className = '',
  ...rest
}) {
  const Component = ICONS[name] || IconInfoCircle;
  return (
    <Component
      size={size}
      stroke={stroke}
      className={className}
      aria-hidden="true"
      {...rest}
    />
  );
}
