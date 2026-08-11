import{describe,expect,it}from'vitest';import{parse}from'../src/infrastructure/storage'
describe('storage',()=>{it('accepts version one',()=>expect(parse('{"version":1,"definitions":[],"setup":{},"preset":"classic"}').version).toBe(1));it('rejects unknown versions',()=>expect(()=>parse('{"version":2,"definitions":[]}')).toThrow())})
