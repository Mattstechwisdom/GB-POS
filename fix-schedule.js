// EMERGENCY FIX: Copy Matt's schedule from calendar to technician record
// This directly manipulates the database to fix the persistence issue
// Run this in the DevTools console while the app is open

console.log('=== EMERGENCY SCHEDULE FIX ===');

async function emergencyScheduleFix() {
  try {
    // The schedule we know exists (from the logs)
    const mattSchedule = {
      mon: { start: '10:00', end: '17:00' },
      tue: { start: '10:00', end: '19:00' },
      wed: { start: '10:00', end: '17:00' },
      thu: { off: true },
      fri: { start: '12:00', end: '19:00' },
      sat: { start: '10:00', end: '20:00' },
      sun: { off: true }
    };

    // Get all technicians
    const technicians = await window.api.dbGet('technicians');
    console.log('All technicians:', technicians);

    // Find Matt
    const matt = technicians.find(t => 
      t.firstName === 'Matt' && t.lastName === 'Floyd'
    );

    if (matt) {
      console.log('Found Matt:', matt);
      
      // Update Matt's record with the schedule
      matt.schedule = mattSchedule;
      
      console.log('Updating Matt with schedule:', matt);
      
      // Try to update via the API
      const result = await window.api.dbUpdate('technicians', matt.id, matt);
      console.log('Update result:', result);
      
      if (result) {
        console.log('✅ SUCCESS: Matt\'s schedule has been saved!');
        alert('✅ Schedule fixed! Close and reopen the Technicians window to see the saved schedule.');
      } else {
        console.log('❌ Update failed via API');
        console.log('Will try direct database manipulation...');
        
        // Alternative: directly call the update with proper parameters
        const directUpdate = await window.api.update('technicians', matt);
        console.log('Direct update result:', directUpdate);
      }
      
    } else {
      console.log('❌ Could not find Matt Floyd in technicians');
    }

  } catch (error) {
    console.error('Emergency fix failed:', error);
  }
}

// Execute the fix
emergencyScheduleFix().then(() => {
  console.log('=== EMERGENCY FIX COMPLETE ===');
});