// Semantic color helpers — pair with useColorScheme() for theme-aware code.
import { useColorScheme } from 'nativewind';

export type Mode = 'light' | 'dark';

const LIGHT = {
  bg:'#F5F6F5', surface:'#FFFFFF', surfaceAlt:'#F4F5F4',
  ink:'#1B1F1D', muted:'#6E7672', faint:'#A5ABA7',
  line:'#E5E8E6', primary:'#2E9C6A', primarySoft:'#DCEDE3',
  star:'#D9952B', danger:'#D74045',
};
const DARK = {
  bg:'#0E1311', surface:'#161B18', surfaceAlt:'#1D231F',
  ink:'#ECEEEC', muted:'#8B928F', faint:'#5F6663',
  line:'#262C29', primary:'#4FAC82', primarySoft:'#1F3D2D',
  star:'#F0BD5A', danger:'#F26F73',
};

export function useColors() {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? DARK : LIGHT;
}
