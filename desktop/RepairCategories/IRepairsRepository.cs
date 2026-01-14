using System.Collections.Generic;
using System.Threading.Tasks;

namespace RepairCategories
{
    public interface IRepairsRepository
    {
        Task<IEnumerable<DeviceCategory>> GetDeviceCategoriesAsync();
        Task<IEnumerable<RepairItem>> GetRepairsAsync();
        Task SaveAsync(RepairItem item);
    }
}
