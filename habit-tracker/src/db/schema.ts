import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull(),
  timezone: text('timezone').notNull().default('Asia/Ho_Chi_Minh'),
  carry_debt: integer('carry_debt', { mode: 'boolean' }).notNull().default(false),
  currency: text('currency').notNull().default('VND'),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon'),
  sort_order: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
});

export const task_types = sqliteTable('task_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),         // 'GOOD' | 'BAD'
  is_time_based: integer('is_time_based', { mode: 'boolean' }).notNull().default(false),
  base_points: integer('base_points').notNull().default(10),
  star_penalty: integer('star_penalty').notNull().default(50),
  category_id: integer('category_id'),
  icon: text('icon'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
});

export const activity_log = sqliteTable('activity_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  task_type_id: integer('task_type_id'),
  kind: text('kind').notNull(),         // 'GOOD' | 'BAD' | 'DAILY_BONUS' | 'PENALTY'
  duration_min: integer('duration_min'),
  points_earned: integer('points_earned').notNull().default(0),
  stars_delta: real('stars_delta').notNull().default(0),
  source: text('source').notNull(),     // 'TASK' | 'DAILY_BONUS' | 'PENALTY'
  logged_at: integer('logged_at').notNull(), // Unix ms
  local_date: text('local_date').notNull(), // YYYY-MM-DD
  week_start: text('week_start').notNull(), // YYYY-MM-DD (Monday)
  note: text('note'),
});

export const daily_summary = sqliteTable('daily_summary', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  local_date: text('local_date').notNull(),
  total_points: integer('total_points').notNull().default(0),
  bonus_star_awarded: integer('bonus_star_awarded', { mode: 'boolean' }).notNull().default(false),
  streak_count: integer('streak_count').notNull().default(0),
});

export const weekly_summary = sqliteTable('weekly_summary', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  week_start: text('week_start').notNull(),
  total_points: integer('total_points').notNull().default(0),
  weekly_stars: real('weekly_stars').notNull().default(0),
  peak_stars: real('peak_stars').notNull().default(0),
  current_tier_id: integer('current_tier_id'),
  start_debt: real('start_debt').notNull().default(0),
  finalized: integer('finalized', { mode: 'boolean' }).notNull().default(false),
});

export const tiers = sqliteTable('tiers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tier_order: integer('tier_order').notNull(),
  stars_required: real('stars_required').notNull(),
  rank_name: text('rank_name').notNull(),
  reward_amount: real('reward_amount').notNull(),
  reward_currency: text('reward_currency').notNull().default('VND'),
});

export const reward_unlocks = sqliteTable('reward_unlocks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  tier_id: integer('tier_id').notNull(),
  week_start: text('week_start').notNull(),
  stars_at_unlock: real('stars_at_unlock').notNull(),
  reward_amount: real('reward_amount').notNull(),
  claimed: integer('claimed', { mode: 'boolean' }).notNull().default(false),
  claimed_at: integer('claimed_at'),
});

export const fund_transactions = sqliteTable('fund_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull(),
  type: text('type').notNull(),         // 'DEPOSIT' | 'WITHDRAWAL'
  amount: real('amount').notNull(),
  currency: text('currency').notNull().default('VND'),
  source_unlock_id: integer('source_unlock_id'),
  note: text('note'),
  occurred_at: integer('occurred_at').notNull(), // Unix ms
});

export const treats = sqliteTable('treats', {
  id: integer('id').primaryKey(),
  user_id: integer('user_id').notNull(),
  name: text('name').notNull(),
  icon: text('icon').notNull().default('gift'),
  target_stars: integer('target_stars').notNull(),
  approx_amount: integer('approx_amount').notNull(),
  currency: text('currency').notNull().default('VND'),
  status: text('status').notNull().default('ACTIVE'),
  sort_order: integer('sort_order').notNull().default(0),
  reached_at: text('reached_at'),
  enjoyed_at: text('enjoyed_at'),
  created_at: text('created_at').notNull(),
});

export const treat_history = sqliteTable('treat_history', {
  id: integer('id').primaryKey(),
  user_id: integer('user_id').notNull(),
  treat_id: integer('treat_id').notNull(),
  name: text('name').notNull(),
  stars_spent: integer('stars_spent').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull().default('VND'),
  enjoyed_at: text('enjoyed_at').notNull(),
});
