import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import {predictionOutput} from '../fixtures/predictions';
import type {PredictionReadResult,DeliveredPrediction} from '../../src/lib/ai/prediction-contracts';
const fixtures=JSON.parse(readFileSync('.local-browser-fixtures.json','utf8'));

// HTTP-mocked AI output test, alongside the separate real database persistence tests.
// No mock provider is registered in the deployed app.
test('AI generation is explicit, twice-clicked output changes, saved results reload, and failure retains the previous result',async({page})=>{
 const fixture=fixtures['post-sale'];
 await page.goto('/login');await page.getByLabel('Email address').fill(fixture.email);await page.getByLabel('Password',{exact:true}).fill(fixtures.password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/dashboard$/);
 const response=await page.request.get('/api/insights?language=en');expect(response.status()).toBe(200);
 const initial:PredictionReadResult=await response.json();const context=initial.context,id=context.facts.products[0].id;
 let saved:DeliveredPrediction|null=null,postCalls=0;
 await page.route('**/api/insights?*',route=>route.fulfill({json:{context,insight:saved,status:saved?'ready':'not_generated',source:saved?'database':'none'}}));
 await page.route('**/api/insights',async route=>{
  if(route.request().method()!=='POST'){await route.continue();return;}
  postCalls++;expect(route.request().postDataJSON()).toEqual({language:'en',regenerate:true});
  if(postCalls===3){await route.fulfill({status:503,json:{error:{message:'AI provider temporarily unavailable'}}});return;}
  const output=predictionOutput(id);output.predictions[0].expected_units_7d=40+postCalls;
  saved={id:`10000000-0000-4000-8000-00000000000${postCalls}`,language:'en',provider:'openrouter',model:'apodex/apodex-1.1-mini:free',prompt_version:'inventory-predictions-v3',facts_hash:context.facts_hash,store_data_revision:context.facts.data_revision,business_date:context.facts.business_date,facts_snapshot:context.facts,generated_at:new Date().toISOString(),content:{schema_version:'ai-prediction-v3',output,provider_response_id:`mock-response-${postCalls}`,response_model:'apodex/apodex-1.1-mini'},output,stale:false,source:'ai_generated'};
  await route.fulfill({json:{context,insight:saved,status:'ready',source:'provider',cached:false,provider_called:true,request_id:`mock-request-${postCalls}`}});
 });
 await page.setViewportSize({width:390,height:844});await page.goto('/insights');
 await expect(page.getByText('No AI prediction generated yet',{exact:true})).toBeVisible();expect(postCalls).toBe(0);
 const select=await page.getByLabel('Insight language').boundingBox(),button=await page.getByRole('button',{name:'Generate AI predictions',exact:true}).boundingBox();
 expect(Math.abs(select!.y-button!.y)).toBeLessThan(5);
 await page.getByRole('button',{name:'Generate AI predictions',exact:true}).click();await expect(page.getByText('New AI result',{exact:true})).toBeVisible();await expect(page.getByText(/Response: mock-response-1/)).toBeVisible();
 await expect(page.getByText('Replenish the beverage in a small first batch',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Generate new AI predictions',exact:true}).click();await expect(page.getByText(/Response: mock-response-2/)).toBeVisible();expect(postCalls).toBe(2);
 await page.getByRole('button',{name:'Generate new AI predictions',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Showing your previous saved result.');await expect(page.getByText(/Response: mock-response-2/)).toBeVisible();
 await page.reload();await expect(page.getByText('Saved AI result',{exact:true})).toBeVisible();expect(postCalls).toBe(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 mkdirSync('test-results/screenshots/390',{recursive:true});
 await page.screenshot({path:'test-results/screenshots/390/ai-generated-prediction-mocked.png',fullPage:true});
});
