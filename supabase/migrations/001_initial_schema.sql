-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Create allocations table
create table public.allocations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users not null,
  sku text not null,
  order_quantity integer not null,
  coverage_days integer not null,
  total_daily_forecast numeric not null,
  allocation_mode text not null check (allocation_mode in ('auto', 'manual')),
  total_allocated integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create allocation_items table (individual warehouse allocations)
create table public.allocation_items (
  id uuid default uuid_generate_v4() primary key,
  allocation_id uuid references public.allocations on delete cascade not null,
  warehouse_id text not null,
  warehouse_name text not null,
  forecast numeric not null,
  on_hand integer not null,
  in_transit integer not null,
  pack_size integer not null,
  target_units numeric not null,
  gap numeric not null,
  allocated_units integer not null,
  coverage_before numeric not null,
  coverage_after numeric not null,
  fulfillment_percentage numeric,
  allocation_percentage numeric,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for better query performance
create index allocations_user_id_idx on public.allocations(user_id);
create index allocations_created_at_idx on public.allocations(created_at desc);
create index allocation_items_allocation_id_idx on public.allocation_items(allocation_id);

-- Enable Row Level Security (RLS)
alter table public.allocations enable row level security;
alter table public.allocation_items enable row level security;

-- Create RLS policies for allocations
create policy "Users can view their own allocations"
  on public.allocations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own allocations"
  on public.allocations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own allocations"
  on public.allocations for update
  using (auth.uid() = user_id);

create policy "Users can delete their own allocations"
  on public.allocations for delete
  using (auth.uid() = user_id);

-- Create RLS policies for allocation_items
create policy "Users can view their own allocation items"
  on public.allocation_items for select
  using (
    exists (
      select 1 from public.allocations
      where allocations.id = allocation_items.allocation_id
      and allocations.user_id = auth.uid()
    )
  );

create policy "Users can insert their own allocation items"
  on public.allocation_items for insert
  with check (
    exists (
      select 1 from public.allocations
      where allocations.id = allocation_items.allocation_id
      and allocations.user_id = auth.uid()
    )
  );

create policy "Users can update their own allocation items"
  on public.allocation_items for update
  using (
    exists (
      select 1 from public.allocations
      where allocations.id = allocation_items.allocation_id
      and allocations.user_id = auth.uid()
    )
  );

create policy "Users can delete their own allocation items"
  on public.allocation_items for delete
  using (
    exists (
      select 1 from public.allocations
      where allocations.id = allocation_items.allocation_id
      and allocations.user_id = auth.uid()
    )
  );
