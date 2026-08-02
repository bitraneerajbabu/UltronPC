import React from 'react';

import {
  IconBuildingFactory, IconWifi, IconWifiOff, IconAlertTriangle, IconBellRinging,
  IconCalendarEvent, IconRefresh, IconX, IconPower, IconRotateClockwise,
  IconPencil, IconTrash, IconPlus, IconRadio, IconChevronDown, IconChevronRight,
  IconChevronLeft, IconCopy, IconSpeakerphone, IconActivity, IconPlayerSkipBack,
  IconHistory, IconChartBar, IconMenu2, IconSun, IconMoon, IconBell, IconUser,
  IconLogout, IconLayoutDashboard, IconAdjustmentsHorizontal, IconMapPin,
} from '@tabler/icons-react';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Factory: IconBuildingFactory,
  Wifi: IconWifi,
  WifiOff: IconWifiOff,
  AlertTriangle: IconAlertTriangle,
  BellRing: IconBellRinging,
  CalendarRange: IconCalendarEvent,
  RefreshCw: IconRefresh,
  X: IconX,
  Power: IconPower,
  RotateCcw: IconRotateClockwise,
  Pencil: IconPencil,
  Trash2: IconTrash,
  Plus: IconPlus,
  Radio: IconRadio,
  ChevronDown: IconChevronDown,
  ChevronRight: IconChevronRight,
  ChevronLeft: IconChevronLeft,
  Copy: IconCopy,
  Megaphone: IconSpeakerphone,
  Activity: IconActivity,
  SkipBack: IconPlayerSkipBack,
  History: IconHistory,
  FileBarChart2: IconChartBar,
  Menu: IconMenu2,
  Sun: IconSun,
  Moon: IconMoon,
  Bell: IconBell,
  User: IconUser,
  LogOut: IconLogout,
  LayoutDashboard: IconLayoutDashboard,
  Sliders: IconAdjustmentsHorizontal,
  MapPin: IconMapPin,
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function Icon({ name, size = 20, color, className, style }: IconProps) {
  const TablerIcon = ICON_MAP[name];

  if (!TablerIcon) {
    console.warn(`[Icon] Name "${name}" not found in icon map`);
    return null;
  }

  return <TablerIcon size={size} color={color} className={className} style={style} />;
}
