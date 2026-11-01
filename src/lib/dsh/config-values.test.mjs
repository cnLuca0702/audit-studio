import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReasoningEfforts, configurationHash} from './config-values.ts';
test('Pi unsupported null efforts are omitted, off null is retained',()=>{
 assert.deepEqual(normalizeReasoningEfforts({off:null,low:'low',medium:null,high:'high',xhigh:null}),{off:null,low:'low',high:'high'});
});
test('no supported non-off effort disables reasoning',()=>{
 for(const map of [{},{off:null},{off:null,low:null,high:null},{low:'',extra:'extra'}]) assert.equal(normalizeReasoningEfforts(map),false);
});
test('configuration digest ignores ordering and detects credentials and effective config changes',()=>{
 assert.equal(configurationHash({a:1,b:2},{KEY:'secret'}),configurationHash({b:2,a:1},{KEY:'secret'}));
 assert.notEqual(configurationHash({a:1},{KEY:'secret'}),configurationHash({a:1},{KEY:'changed'}));
 assert.notEqual(configurationHash({a:1},{}),configurationHash({a:2},{}));
});
