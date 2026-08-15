// Replaces @tauri-apps/plugin-store

export class Store {
    private key: string;
    private data: Record<string, unknown> = {};

    constructor(key: string) {
        this.key = key;
        const saved = localStorage.getItem(key);
        if (saved) this.data = JSON.parse(saved);
    }

    static async load(key: string): Promise<Store> {
        return new Store(key);
    }

    async get<T>(key: string): Promise<T | undefined> {
        return this.data[key] as T;
    }

    async set(key: string, value: unknown): Promise<void> {
        this.data[key] = value;
    }

    async delete(key: string): Promise<void> {
        delete this.data[key];
    }

    async save(): Promise<void> {
        localStorage.setItem(this.key, JSON.stringify(this.data));
    }
}

// Named export — AuthWizard uses: import { load } from '@tauri-apps/plugin-store'
export async function load(key: string): Promise<Store> {
    return new Store(key);
}