import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TodayScreen } from '../screens/TodayScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { FundScreen } from '../screens/FundScreen';
import { RankScreen } from '../screens/RankScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { AppColors, Shadows } from '../theme';
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

function IconGift({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3.5" y="9" width="17" height="11" rx="1.5" />
      <Path d="M3.5 13h17M12 9v11M12 9c-1-3-7-3-5 0M12 9c1-3 7-3 5 0" />
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
        name="Analytics"
        component={ProgressScreen}
        options={{ title: t.tabAnalytics, tabBarIcon: ({ color }) => <IconChart color={color} /> }}
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
        name="Fund"
        component={FundScreen}
        options={{ title: t.tabRewards, tabBarIcon: ({ color }) => <IconGift color={color} /> }}
      />
      <Tab.Screen
        name="Rank"
        component={RankScreen}
        options={{ title: 'Rank', tabBarIcon: ({ color }) => <IconTrophy color={color} /> }}
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
  onSignInWithGoogle: (user: GoogleUser) => Promise<boolean>;
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
