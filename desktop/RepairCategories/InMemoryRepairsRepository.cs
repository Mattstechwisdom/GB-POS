using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace RepairCategories
{
    public class InMemoryRepairsRepository : IRepairsRepository
    {
        private readonly List<DeviceCategory> _deviceCategories = new List<DeviceCategory>();
        private readonly List<RepairItem> _repairs = new List<RepairItem>();

        public InMemoryRepairsRepository()
        {
            // intentionally no seeded data — collections start empty
        }

        public Task<IEnumerable<DeviceCategory>> GetDeviceCategoriesAsync()
        {
            return Task.FromResult(_deviceCategories.AsEnumerable());
        }

        public Task<IEnumerable<RepairItem>> GetRepairsAsync()
        {
            return Task.FromResult(_repairs.AsEnumerable());
        }

        public Task SaveAsync(RepairItem item)
        {
            if (item == null) throw new ArgumentNullException(nameof(item));

            // assign id if missing
            if (string.IsNullOrWhiteSpace(item.Id))
            {
                item.Id = Guid.NewGuid().ToString("N");
                _repairs.Add(item);
            }
            else
            {
                var idx = _repairs.FindIndex(r => r.Id == item.Id);
                if (idx == -1) _repairs.Add(item);
                else _repairs[idx] = item;
            }

            // ensure device category exists in list (if provided)
            if (item.DeviceCategory != null && !string.IsNullOrWhiteSpace(item.DeviceCategory.Id))
            {
                if (!_deviceCategories.Exists(c => c.Id == item.DeviceCategory.Id))
                {
                    _deviceCategories.Add(new DeviceCategory { Id = item.DeviceCategory.Id, Name = item.DeviceCategory.Name });
                }
            }

            return Task.CompletedTask;
        }
    }
}
