# Feature Development Quick Reference

This guide provides quick templates and examples for adding new features to Percolator Launch.

## Table of Contents

- [Adding a Backend Feature](#adding-a-backend-feature)
- [Adding a Frontend Feature](#adding-a-frontend-feature)
- [Adding Real-time Features](#adding-real-time-features)
- [Adding Database Tables](#adding-database-tables)
- [Common Code Patterns](#common-code-patterns)
- [Testing Your Feature](#testing-your-feature)

---

## Adding a Backend Feature

### Step 1: Create a Service (if needed)

**File:** `packages/server/src/services/MyFeatureService.ts`

```typescript
import { PublicKey } from "@solana/web3.js";

interface MyFeatureConfig {
  updateInterval?: number;
  enabled?: boolean;
}

export class MyFeatureService {
  private intervalId?: NodeJS.Timeout;
  private data: Map<string, any> = new Map();

  constructor(private config: MyFeatureConfig = {}) {}

  start(): void {
    console.log("Starting MyFeatureService...");
    
    if (this.config.enabled === false) {
      console.log("MyFeatureService is disabled");
      return;
    }

    // Start periodic task if needed
    const interval = this.config.updateInterval ?? 60000; // 1 minute default
    this.intervalId = setInterval(() => this.update(), interval);

    console.log("MyFeatureService started");
  }

  stop(): void {
    console.log("Stopping MyFeatureService...");
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    console.log("MyFeatureService stopped");
  }

  private async update(): Promise<void> {
    try {
      // Periodic update logic
      console.log("MyFeatureService: Running update...");
    } catch (error) {
      console.error("MyFeatureService update error:", error);
    }
  }

  // Public API methods
  getData(slabAddress: string): any | undefined {
    return this.data.get(slabAddress);
  }

  getAllData(): Map<string, any> {
    return new Map(this.data);
  }

  getStatus(): any {
    return {
      enabled: this.config.enabled !== false,
      dataCount: this.data.size,
      lastUpdate: new Date().toISOString(),
    };
  }
}
```

### Step 2: Register Service in Main Server

**File:** `packages/server/src/index.ts`

```typescript
// Add to imports
import { MyFeatureService } from "./services/MyFeatureService";

// After other service instantiations (around line 26)
const myFeatureService = new MyFeatureService({
  updateInterval: 30000,
  enabled: true,
});

// After crank discovery (around line 140)
myFeatureService.start();

// In shutdown handler (around line 250)
myFeatureService.stop();
```

### Step 3: Create API Routes

**File:** `packages/server/src/routes/my-feature.ts`

```typescript
import { Hono } from "hono";
import type { MyFeatureService } from "../services/MyFeatureService";
import { validateSlab } from "./utils";

interface MyFeatureDeps {
  myFeatureService: MyFeatureService;
}

export function myFeatureRoutes(deps: MyFeatureDeps): Hono {
  const app = new Hono();

  // GET /my-feature - Get all data
  app.get("/", (c) => {
    const allData = deps.myFeatureService.getAllData();
    return c.json({
      data: Array.from(allData.entries()).map(([slab, data]) => ({
        slab,
        ...data,
      })),
    });
  });

  // GET /my-feature/:slab - Get data for specific slab
  app.get("/:slab", validateSlab, (c) => {
    const slabAddress = c.req.param("slab");
    const data = deps.myFeatureService.getData(slabAddress);

    if (!data) {
      return c.json({ error: "Data not found" }, { status: 404 });
    }

    return c.json({ data });
  });

  // GET /my-feature/status - Get service status
  app.get("/status", (c) => {
    const status = deps.myFeatureService.getStatus();
    return c.json({ status });
  });

  return app;
}
```

### Step 4: Mount Routes

**File:** `packages/server/src/index.ts`

```typescript
// Add to imports
import { myFeatureRoutes } from "./routes/my-feature";

// After other route mounts (around line 60)
app.route("/my-feature", myFeatureRoutes({ myFeatureService }));
```

---

## Adding a Frontend Feature

### Step 1: Create API Route (Next.js)

**File:** `app/app/api/my-feature/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
    const response = await fetch(`${backendUrl}/my-feature`);
    
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching my-feature data:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
```

**File:** `app/app/api/my-feature/[slab]/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slab: string }> }
) {
  try {
    const { slab } = await params;
    const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
    const response = await fetch(`${backendUrl}/my-feature/${slab}`);
    
    if (!response.ok) {
      throw new Error(`Backend responded with ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching my-feature data:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
```

### Step 2: Create Custom Hook

**File:** `app/hooks/useMyFeature.ts`

```typescript
"use client";

import { useCallback, useEffect, useState } from "react";

interface MyFeatureData {
  slab: string;
  value: number;
  timestamp: string;
}

interface UseMyFeatureResult {
  data: MyFeatureData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useMyFeature(slabAddress?: string): UseMyFeatureResult {
  const [data, setData] = useState<MyFeatureData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!slabAddress) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/my-feature/${slabAddress}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      setData(json.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("useMyFeature error:", err);
    } finally {
      setLoading(false);
    }
  }, [slabAddress]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
  };
}
```

### Step 3: Create UI Component

**File:** `app/components/my-feature/MyFeatureCard.tsx`

```typescript
"use client";

import { useMyFeature } from "@/hooks/useMyFeature";
import { useSlabState } from "@/components/providers/SlabProvider";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function MyFeatureCard() {
  const { config: mktConfig } = useSlabState();
  const slabAddress = mktConfig?.slabAddress;

  const { data, loading, error, refresh } = useMyFeature(slabAddress);

  if (!slabAddress) {
    return (
      <div className="glass-card p-4">
        <p className="text-gray-500">No market selected</p>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="glass-card p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-4 border-red-500">
        <p className="text-red-500">Error: {error}</p>
        <Button
          onClick={refresh}
          variant="outline"
          size="sm"
          className="mt-2"
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">My Feature</h3>
        <Button
          onClick={refresh}
          variant="ghost"
          size="sm"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {data && (
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-400">Value:</span>
            <span className="font-mono">{data.value}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Updated:</span>
            <span className="text-sm">
              {new Date(data.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

### Step 4: Add to Page

**File:** `app/app/page.tsx` (or create new page)

```typescript
import { MyFeatureCard } from "@/components/my-feature/MyFeatureCard";

export default function HomePage() {
  return (
    <main className="container mx-auto p-4">
      {/* Other components */}
      <MyFeatureCard />
    </main>
  );
}
```

---

## Adding Real-time Features

### WebSocket Backend Route

**File:** `packages/server/src/routes/my-feature-ws.ts`

```typescript
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/cloudflare-workers";
import type { MyFeatureService } from "../services/MyFeatureService";

interface MyFeatureWSDeps {
  myFeatureService: MyFeatureService;
}

export function myFeatureWSRoutes(deps: MyFeatureWSDeps): Hono {
  const app = new Hono();

  app.get(
    "/stream/:slab",
    upgradeWebSocket((c) => {
      const slabAddress = c.req.param("slab");
      let intervalId: NodeJS.Timeout;

      return {
        onOpen: (_event, ws) => {
          console.log(`WebSocket opened for ${slabAddress}`);

          // Send initial data
          const initialData = deps.myFeatureService.getData(slabAddress);
          ws.send(JSON.stringify({ type: "initial", data: initialData }));

          // Send updates every 5 seconds
          intervalId = setInterval(() => {
            const data = deps.myFeatureService.getData(slabAddress);
            ws.send(JSON.stringify({ type: "update", data }));
          }, 5000);
        },

        onMessage: (event) => {
          console.log(`Received: ${event.data}`);
          // Handle client messages if needed
        },

        onClose: () => {
          console.log(`WebSocket closed for ${slabAddress}`);
          if (intervalId) {
            clearInterval(intervalId);
          }
        },

        onError: (error) => {
          console.error("WebSocket error:", error);
        },
      };
    })
  );

  return app;
}
```

### WebSocket Frontend Hook

**File:** `app/hooks/useMyFeatureStream.ts`

```typescript
"use client";

import { useEffect, useState, useRef } from "react";

interface MyFeatureStreamData {
  value: number;
  timestamp: string;
}

export function useMyFeatureStream(slabAddress?: string) {
  const [data, setData] = useState<MyFeatureStreamData | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!slabAddress) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3001";
    const ws = new WebSocket(`${wsUrl}/my-feature/stream/${slabAddress}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "initial" || message.type === "update") {
          setData(message.data);
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [slabAddress]);

  return { data, connected };
}
```

---

## Adding Database Tables

### Step 1: Create Migration

**File:** `supabase/migrations/YYYYMMDD_my_feature.sql`

```sql
-- Create table
CREATE TABLE my_feature_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slab_address TEXT NOT NULL,
  value NUMERIC NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_my_feature_slab ON my_feature_data(slab_address);
CREATE INDEX idx_my_feature_created ON my_feature_data(created_at DESC);

-- Create composite index if needed
CREATE INDEX idx_my_feature_slab_created ON my_feature_data(slab_address, created_at DESC);

-- Add RLS policies (if using Row Level Security)
ALTER TABLE my_feature_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access"
  ON my_feature_data
  FOR SELECT
  USING (true);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_my_feature_updated_at
  BEFORE UPDATE ON my_feature_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Step 2: Add Database Queries

**File:** `packages/server/src/db/queries.ts`

Add to existing file:

```typescript
// Add interface
export interface MyFeatureDataRow {
  id: string;
  slab_address: string;
  value: number;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

// Add query functions
export async function getMyFeatureData(
  slabAddress: string
): Promise<MyFeatureDataRow[]> {
  const { data, error } = await getSupabase()
    .from("my_feature_data")
    .select("*")
    .eq("slab_address", slabAddress)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching my_feature_data:", error);
    throw error;
  }

  return data ?? [];
}

export async function insertMyFeatureData(
  slabAddress: string,
  value: number,
  metadata?: any
): Promise<MyFeatureDataRow> {
  const { data, error } = await getSupabase()
    .from("my_feature_data")
    .insert({
      slab_address: slabAddress,
      value,
      metadata,
    })
    .select()
    .single();

  if (error) {
    console.error("Error inserting my_feature_data:", error);
    throw error;
  }

  return data;
}

export async function getLatestMyFeatureData(
  slabAddress: string
): Promise<MyFeatureDataRow | null> {
  const { data, error } = await getSupabase()
    .from("my_feature_data")
    .select("*")
    .eq("slab_address", slabAddress)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // No rows found
      return null;
    }
    console.error("Error fetching latest my_feature_data:", error);
    throw error;
  }

  return data;
}
```

### Step 3: Apply Migration

```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase dashboard
# Copy SQL from migration file and run in SQL Editor
```

---

## Common Code Patterns

### Rate Limiting

```typescript
import { readRateLimit, writeRateLimit } from "../middleware/rateLimit";

// In route
app.get("/expensive-operation", readRateLimit(), async (c) => {
  // This endpoint is rate limited
});

app.post("/write-operation", writeRateLimit(), async (c) => {
  // This endpoint has stricter rate limits
});
```

### API Key Authentication

```typescript
import { requireApiKey } from "../middleware/auth";

// Protect sensitive endpoints
app.post("/admin/action", requireApiKey(), async (c) => {
  // Only accessible with valid API key
});
```

### Error Handling

```typescript
// Backend
try {
  const result = await riskyOperation();
  return c.json({ data: result });
} catch (error) {
  console.error("Operation failed:", error);
  return c.json(
    { error: error instanceof Error ? error.message : "Internal server error" },
    { status: 500 }
  );
}

// Frontend
try {
  const response = await fetch("/api/endpoint");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = await response.json();
  return data;
} catch (error) {
  console.error("Fetch failed:", error);
  throw error;
}
```

### Using Event Bus

```typescript
import { eventBus } from "./events";

// Emit event
eventBus.emit("my-feature.updated", {
  slabAddress: "...",
  value: 123,
  timestamp: new Date().toISOString(),
});

// Subscribe to event
eventBus.on("my-feature.updated", (payload) => {
  console.log("Feature updated:", payload);
  // React to the event
});
```

---

## Testing Your Feature

### Backend Unit Test

**File:** `packages/server/src/__tests__/MyFeatureService.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MyFeatureService } from "../services/MyFeatureService";

describe("MyFeatureService", () => {
  let service: MyFeatureService;

  beforeEach(() => {
    service = new MyFeatureService({ enabled: true });
  });

  afterEach(() => {
    service.stop();
  });

  it("should start successfully", () => {
    expect(() => service.start()).not.toThrow();
    const status = service.getStatus();
    expect(status.enabled).toBe(true);
  });

  it("should return data for valid slab", () => {
    const testSlab = "test123";
    // Setup test data...
    const data = service.getData(testSlab);
    expect(data).toBeDefined();
  });

  it("should return undefined for unknown slab", () => {
    const data = service.getData("unknown");
    expect(data).toBeUndefined();
  });
});
```

### Frontend Component Test

**File:** `app/__tests__/MyFeatureCard.test.tsx`

```typescript
import { render, screen, waitFor } from "@testing-library/react";
import { MyFeatureCard } from "@/components/my-feature/MyFeatureCard";

// Mock the hook
jest.mock("@/hooks/useMyFeature", () => ({
  useMyFeature: () => ({
    data: { value: 100, timestamp: "2024-01-01T00:00:00Z" },
    loading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

describe("MyFeatureCard", () => {
  it("renders data correctly", async () => {
    render(<MyFeatureCard />);
    
    await waitFor(() => {
      expect(screen.getByText("My Feature")).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();
    });
  });
});
```

### E2E Test

**File:** `e2e/my-feature.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test("my feature displays correctly", async ({ page }) => {
  await page.goto("/");
  
  // Wait for feature to load
  await page.waitForSelector('[data-testid="my-feature-card"]');
  
  // Check content
  const card = page.locator('[data-testid="my-feature-card"]');
  await expect(card).toBeVisible();
  
  // Test interaction
  const refreshButton = card.locator('button[aria-label="Refresh"]');
  await refreshButton.click();
  
  // Verify update
  await page.waitForTimeout(1000);
  await expect(card).toContainText("Updated");
});
```

### Run Tests

```bash
# Backend tests
pnpm --filter @percolator/server test

# Frontend tests
pnpm --filter @percolator/app test

# E2E tests
pnpm test:e2e

# Specific test file
pnpm test MyFeatureService.test.ts
```

---

## Checklist for New Feature

- [ ] Backend service created (if needed)
- [ ] Backend routes implemented
- [ ] Database migration created (if needed)
- [ ] Database queries added (if needed)
- [ ] Frontend API route created
- [ ] Custom hook implemented
- [ ] UI components created
- [ ] Added to appropriate page
- [ ] Unit tests written
- [ ] E2E tests written (if user-facing)
- [ ] Documentation updated
- [ ] Tested locally
- [ ] Code reviewed
- [ ] Environment variables added to `.env.example`
- [ ] Migration applied to database

---

*For more detailed information, see [ARCHITECTURE.md](./ARCHITECTURE.md)*
