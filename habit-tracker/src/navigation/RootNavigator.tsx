import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TodayScreen } from '../screens/TodayScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { CalendarScreen } from '../screens/CalendarScreen';
import { RankScreen } from '../screens/RankScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { AppColors, Shadows } from '../config/theme';
import { useTheme, useTranslations } from '../hooks/useSettings';
import { LogActivitySheet } from '../screens/LogActivitySheet';
import { GoogleUser } from '../hooks/useAuth';

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

function IconPlus() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round">
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

function FABButton({ onPress, colors }: { onPress: () => void; colors: AppColors }) {
  return (
    <TouchableOpacity style={fabStyles.container} onPress={onPress} activeOpacity={0.85}>
      <View style={[fabStyles.button, { backgroundColor: colors.primary }]}>
        <IconPlus />
      </View>
    </TouchableOpacity>
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          height: 86,
          paddingBottom: 0,
          paddingTop: 9,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 4 },
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
        options={{ title: t.tabAnalytics, tabBarIcon: ({ color }) => <IconChart color={color} /> }}
      />
      <Tab.Screen
        name="Rank"
        component={RankScreen}
        options={{ title: t.tabRank, tabBarIcon: ({ color }) => <IconTrophy color={color} /> }}
      />
    </Tab.Navigator>
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
  const { colors } = useTheme();
  const t = useTranslations();

  const modalHeaderOptions = {
    presentation: 'modal' as const,
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
      </Stack.Navigator>
      <LogActivitySheet visible={fabVisible} onClose={() => setFabVisible(false)} />
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
