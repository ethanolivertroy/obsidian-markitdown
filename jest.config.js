/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/__tests__/**/*.test.ts'],
	moduleNameMapper: {
		'^obsidian$': '<rootDir>/src/__mocks__/obsidian.ts',
	},
	transform: {
		'^.+\\.ts$': ['ts-jest', {
			tsconfig: {
				module: 'commonjs',
				moduleResolution: 'node',
				esModuleInterop: true,
				target: 'ES2020',
				strict: true,
				noImplicitAny: true,
				baseUrl: '.',
				lib: ['ES2020'],
			},
		}],
	},
};
