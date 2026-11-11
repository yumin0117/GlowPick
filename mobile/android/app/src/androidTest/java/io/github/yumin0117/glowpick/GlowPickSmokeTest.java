package io.github.yumin0117.glowpick;

import static org.junit.Assert.*;
import static androidx.test.espresso.web.sugar.Web.onWebView;
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.DriverAtoms.webClick;
import static androidx.test.espresso.intent.Intents.intending;
import static androidx.test.espresso.intent.matcher.IntentMatchers.hasAction;
import static androidx.test.espresso.Espresso.onView;
import static androidx.test.espresso.matcher.ViewMatchers.isAssignableFrom;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.SystemClock;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import androidx.test.core.app.ActivityScenario;
import androidx.test.espresso.intent.Intents;
import androidx.test.espresso.action.GeneralClickAction;
import androidx.test.espresso.action.Press;
import androidx.test.espresso.action.Tap;
import androidx.test.espresso.web.webdriver.Locator;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONTokener;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** APK installation/WebView/file-chooser bridge checks. Never uses an API key or calls Gemini. */
@RunWith(AndroidJUnit4.class)
public class GlowPickSmokeTest {
    private Object read(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(expression, result -> {
            value.set(result); ready.countDown();
        }));
        assertTrue("WebView read timed out", ready.await(10, TimeUnit.SECONDS));
        return new JSONTokener(value.get()).nextValue();
    }

    private void await(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 30000;
        while (SystemClock.elapsedRealtime() < deadline) {
            if (Boolean.TRUE.equals(read(scenario, expression))) return;
            SystemClock.sleep(200);
        }
        fail("Web screen condition not met: " + expression);
    }

    // File inputs require genuine user activation; WebDriver's JS click cannot grant it.
    private void tapFileChooser(ActivityScenario<MainActivity> scenario) throws Exception {
        read(scenario, "(()=>{document.getElementById('cosmeticChoose').scrollIntoView({block:'center',behavior:'instant'});return true})()");
        JSONObject rect = (JSONObject) read(scenario, "(()=>{const r=document.getElementById('cosmeticChoose').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,scale:devicePixelRatio}})()");
        float cssX = (float) rect.getDouble("x"), cssY = (float) rect.getDouble("y");
        float scale = (float) rect.getDouble("scale");
        onView(isAssignableFrom(WebView.class)).perform(new GeneralClickAction(Tap.SINGLE, view -> {
            int[] position = new int[2]; view.getLocationOnScreen(position);
            return new float[]{position[0] + cssX * scale, position[1] + cssY * scale};
        }, Press.FINGER));
    }

    @Test public void bundledScreenPhotoPickerTabsAndKeyGuardWork() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File photo = new File(context.getCacheDir(), "upload-check.png");
        Bitmap fixture = Bitmap.createBitmap(64, 64, Bitmap.Config.ARGB_8888);
        fixture.eraseColor(Color.WHITE);
        try (FileOutputStream stream = new FileOutputStream(photo)) {
            assertTrue(fixture.compress(Bitmap.CompressFormat.PNG, 100, stream));
        }
        fixture.recycle();
        Uri uri = FileProvider.getUriForFile(context, "io.github.yumin0117.glowpick.fileprovider", photo);
        Intents.init();
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            await(scenario, "!!document.getElementById('cosmeticChoose') && document.readyState === 'complete'");
            assertEquals("https://localhost", read(scenario, "location.origin"));
            assertTrue(Boolean.TRUE.equals(read(scenario, "document.title.includes('GlowPick')")));
            assertTrue(Boolean.TRUE.equals(read(scenario, "document.documentElement.scrollWidth <= innerWidth + 1")));
            assertTrue(Boolean.TRUE.equals(read(scenario, "document.getElementById('geminiApiKey').value.length === 0")));
            intending(hasAction(Intent.ACTION_GET_CONTENT)).respondWith(new Instrumentation.ActivityResult(
                Activity.RESULT_OK, new Intent().setData(uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)));
            tapFileChooser(scenario);
            await(scenario, "document.getElementById('cosmeticFileName').textContent === 'upload-check.png'");
            await(scenario, "document.getElementById('cosmeticPreviewImage').naturalWidth === 64");
            onWebView().withElement(findElement(Locator.CSS_SELECTOR, "#cosmeticConcerns label:nth-child(3)")).perform(webClick());
            onWebView().withElement(findElement(Locator.ID, "cosmeticAnalyze")).perform(webClick());
            await(scenario, "document.getElementById('cosmeticMessage').textContent.includes('API 키')");
            onWebView().withElement(findElement(Locator.ID, "tab-pack")).perform(webClick());
            await(scenario, "document.getElementById('tab-pack').getAttribute('aria-selected') === 'true'");
            onWebView().withElement(findElement(Locator.ID, "tab-cosmetic")).perform(webClick());
            await(scenario, "document.getElementById('tab-cosmetic').getAttribute('aria-selected') === 'true'");
            Bitmap screenshot = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
            assertNotNull(screenshot);
            try (FileOutputStream stream = new FileOutputStream(new File(context.getExternalFilesDir(null), "GlowPick-Android.png"))) {
                assertTrue(screenshot.compress(Bitmap.CompressFormat.PNG, 100, stream));
            }
            screenshot.recycle();
        } finally { Intents.release(); }
    }
}
