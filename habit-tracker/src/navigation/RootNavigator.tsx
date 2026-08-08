import React, { useState, useMemo, useEffect } from 'react';
import { BackHandler, View, Pressable, StyleSheet, StatusBar, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TodayScreen } from '../screens/TodayScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { RankScreen } from '../screens/RankScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ChallengeHubScreen } from '../screens/ChallengeHubScreen';
import { CreateChallengeScreen } from '../screens/CreateChallengeScreen';
import { ChallengeDetailScreen } from '../screens/ChallengeDetailScreen';
import { NewsScreen } from '../screens/UpdatesScreen';
import { TrophyShelfScreen } from '../screens/TrophyShelfScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { AppColors, Shadows, FontFamily } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { AddActivitySheet } from '../screens/AddActivitySheet';
import { GoogleUser } from '../hooks/useAuth';
import { useTutorial } from '../hooks/useTutorial';
import { subscribeAddActivityIntent } from '../hooks/useAddActivityIntent';
import { BOTTOM_TAB_BAR_HEIGHT } from '../config/layout';
import { BadgeUnlockCelebrationHost } from '../components/BadgeUnlockCelebration';
import { APP_STACK_PRESENTATION } from './stackOptions';
import { handleAppHardwareBack } from './backHandler';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function IconHome({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11l9-8 9 8M5 10v10h6v-6h2v6h6V10" />
    </Svg>
  );
}

function IconChart({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 20h18M6 20v-7M12 20V5M18 20v-10" />
    </Svg>
  );
}

function IconCalendar({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M8 2v3M16 2v3M3 9h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <Path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
    </Svg>
  );
}

function IconTrophy({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M9 20h6M12 14v6" />
    </Svg>
  );
}

function IconPlus({ color }: { color: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.6} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

function FABButton({ onPress, colors }: { onPress: () => void; colors: AppColors }) {
  const { targetRef } = useTutorial();
  const t = useTranslations();
  const fabRef = useMemo(() => targetRef('fab'), [targetRef]);
  return (
    <Pressable style={fabStyles.container} onPress={onPress} android_ripple={{ color: colors.primaryPress, borderless: true, radius: 29 }} accessibilityLabel={t.addActivity} accessibilityRole="button">
      <View ref={fabRef} collapsable={false} style={[fabStyles.button, { backgroundColor: colors.primary, shadowColor: colors.primary }]}>
        <IconPlus color={colors.onAccent} />
      </View>
    </Pressable>
  );
}

const fabStyles = StyleSheet.create({
  container: { top: -18, justifyContent: 'center', alignItems: 'center' },
  button: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.hero,
  },
});

function MainTabs({ onFABPress }: { onFABPress: () => void }) {
  const { colors } = useTheme();
  const t = useTranslations();
  const { width } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  const { targetRef } = useTutorial();
  const analyticsTutorialRef = useMemo(() => targetRef('analytics'), [targetRef]);
  const rankTutorialRef = useMemo(() => targetRef('rank'), [targetRef]);
  const tabBarHeight = BOTTOM_TAB_BAR_HEIGHT + insets.bottom;
  const responsiveWidth = containerWidth ?? width;
  return (
    <View
      style={{ flex: 1 }}
      onLayout={({ nativeEvent }) => {
        const nextWidth = Math.round(nativeEvent.layout.width);
        setContainerWidth(previousWidth => previousWidth === nextWidth ? previousWidth : nextWidth);
      }}
    >
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.line,
            height: tabBarHeight,
            paddingBottom: insets.bottom + (Platform.OS === 'android' ? 4 : 0),
            paddingTop: 9,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.faint,
          tabBarAllowFontScaling: true,
          tabBarShowLabel: responsiveWidth >= 320,
          tabBarLabelStyle: { fontSize: 10, fontFamily: FontFamily.bold, marginTop: 4 },
        }}
      >
        <Tab.Screen
          name="Home"
          component={TodayScreen}
          options={{ title: t.tabHome, tabBarIcon: ({ color }) => <IconHome color={color} /> }}
        />
        <Tab.Screen
          name="Calendar"
          component={CalendarScreen}
          options={{ title: t.tabCalendar, tabBarIcon: ({ color }) => <IconCalendar color={color} /> }}
        />
        <Tab.Screen
          name="Log"
          component={TodayScreen}
          options={{
            tabBarButton: () => <FABButton onPress={onFABPress} colors={colors} />,
            title: '',
          }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tab.Screen
          name="Analytics"
          component={ProgressScreen}
          options={{
            title: t.tabAnalytics,
            tabBarIcon: ({ color }) => <View ref={analyticsTutorialRef} collapsable={false}><IconChart color={color} /></View>,
          }}
        />
        <Tab.Screen
          name="Rank"
          component={RankScreen}
          options={{
            title: t.tabRank,
            tabBarIcon: ({ color }) => <View ref={rankTutorialRef} collapsable={false}><IconTrophy color={color} /></View>,
          }}
        />
      </Tab.Navigator>
    </View>
  );
}

function AppStack({
  googleUser,
  onSignOut,
  onDeleteAccount,
}: {
  googleUser: GoogleUser;
  onSignOut: () => Promise<void>;
  onDeleteAccount: (userId: number) => Promise<void>;
}) {
  const [fabVisible, setFabVisible] = useState(false);
  const [presetName, setPresetName] = useState<string | null>(null);
  const { colors } = useTheme();
  const t = useTranslations();
  const navigation = useNavigation();

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => handleAppHardwareBack(navigation));
    return () => subscription.remove();
  }, [navigation]);

  useEffect(() => subscribeAddActivityIntent(intent => {
    setPresetName(intent.name);
    setFabVisible(true);
  }), []);

  const modalHeaderOptions = {
    presentation: APP_STACK_PRESENTATION,
    headerShown: true,
    headerTintColor: colors.primary,
    headerStyle: { backgroundColor: colors.surface },
    headerTitleStyle: { color: colors.inkDark },
  };

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs">
          {() => <MainTabs onFABPress={() => setFabVisible(true)} />}
        </Stack.Screen>
        <Stack.Screen
          name="Profile"
          options={{ ...modalHeaderOptions, title: t.screenProfile }}
        >
          {() => <ProfileScreen googleUser={googleUser} onSignOut={onSignOut} />}
        </Stack.Screen>
        <Stack.Screen
          name="Settings"
          options={{ ...modalHeaderOptions, title: t.screenSettings }}
        >
          {() => <SettingsScreen onDeleteAccount={onDeleteAccount} />}
        </Stack.Screen>
        <Stack.Screen
          name="News"
          component={NewsScreen}
          options={{ ...modalHeaderOptions, title: t.screenNews }}
        />
        <Stack.Screen
          name="ChallengeHub"
          component={ChallengeHubScreen}
          options={{ ...modalHeaderOptions, title: t.screenChallengeHub }}
        />
        <Stack.Screen
          name="CreateChallenge"
          component={CreateChallengeScreen}
          options={{ ...modalHeaderOptions, title: t.screenCreateChallenge }}
        />
        <Stack.Screen
          name="ChallengeDetail"
          component={ChallengeDetailScreen}
          options={{ ...modalHeaderOptions, title: t.screenChallengeDetail }}
        />
        <Stack.Screen
          name="TrophyShelf"
          component={TrophyShelfScreen}
          options={{ ...modalHeaderOptions, title: t.screenTrophyShelf }}
        />
      </Stack.Navigator>
      <AddActivitySheet
        visible={fabVisible}
        presetName={presetName}
        onClose={() => { setFabVisible(false); setPresetName(null); }}
      />
      <BadgeUnlockCelebrationHost />
    </>
  );
}

export function RootNavigator({
  isOnboarded,
  googleUser,
  onCompleteOnboarding,
  onSignInWithGoogle,
  onSignOut,
  onDeleteAccount,
}: {
  isOnboarded: boolean;
  googleUser: GoogleUser | null;
  onCompleteOnboarding: () => Promise<void>;
  onSignInWithGoogle: (user: GoogleUser, idToken?: string) => Promise<boolean>;
  onSignOut: () => Promise<void>;
  onDeleteAccount: (userId: number) => Promise<void>;
}) {
  const { isDark } = useTheme();
  return (
    <NavigationContainer>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      {googleUser !== null && isOnboarded ? (
        <AppStack googleUser={googleUser} onSignOut={onSignOut} onDeleteAccount={onDeleteAccount} />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="SignIn">
            {({ navigation }) => (
              <SignInScreen
                onSignIn={() => navigation.navigate('Onboarding' as never)}
                onSignInWithGoogle={onSignInWithGoogle}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Onboarding">
            {() => <OnboardingScreen onComplete={onCompleteOnboarding} />}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
