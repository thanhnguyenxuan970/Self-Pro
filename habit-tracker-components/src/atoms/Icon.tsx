// Minimal stroke-icon set — uses react-native-svg.
import Svg, { Path, Circle, Rect } from 'react-native-svg';

export type IconName =
  | 'home' | 'chart' | 'gift' | 'trophy' | 'plus' | 'star'
  | 'sun' | 'moon' | 'check' | 'close' | 'chevron-right';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  filled?: boolean;
}

export function Icon({ name, size = 24, color = '#1B1F1D', filled }: IconProps) {
  const stroke = color, fill = filled ? color : 'none', sw = filled ? 0 : 1.9;
  switch (name) {
    case 'home':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 11l9-8 9 8M5 10v10h6v-6h2v6h6V10" stroke={stroke} strokeWidth={sw} fill={fill} strokeLinecap="round" strokeLinejoin="round"/></Svg>;
    case 'chart':   return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M3 20h18M6 20v-7M12 20V5M18 20v-10" stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round"/></Svg>;
    case 'gift':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Rect x="3.5" y="9" width="17" height="11" rx="1.5" stroke={stroke} strokeWidth={sw} fill="none"/><Path d="M3.5 13h17M12 9v11M12 9c-1-3-7-3-5 0M12 9c1-3 7-3 5 0" stroke={stroke} strokeWidth={sw} fill="none"/></Svg>;
    case 'trophy':  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M9 20h6M12 14v6" stroke={stroke} strokeWidth={sw} fill="none" strokeLinecap="round"/></Svg>;
    case 'plus':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 5v14M5 12h14" stroke={stroke} strokeWidth={2.4} strokeLinecap="round"/></Svg>;
    case 'star':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M12 2l2.9 6.9 7.6.6-5.8 5 1.8 7.4L12 18l-6.5 3.9 1.8-7.4-5.8-5 7.6-.6z" fill={color}/></Svg>;
    case 'sun':     return <Svg width={size} height={size} viewBox="0 0 24 24"><Circle cx="12" cy="12" r="4" stroke={stroke} strokeWidth={sw} fill="none"/><Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke={stroke} strokeWidth={sw}/></Svg>;
    case 'moon':    return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" stroke={stroke} strokeWidth={sw} fill="none"/></Svg>;
    case 'check':   return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M5 12l4 4 10-10" stroke={stroke} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
    case 'close':   return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6L6 18" stroke={stroke} strokeWidth={2.2} strokeLinecap="round"/></Svg>;
    case 'chevron-right': return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d="M9 6l6 6-6 6" stroke={stroke} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round"/></Svg>;
  }
}
export default Icon;
